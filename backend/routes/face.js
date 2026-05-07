// backend/routes/face.js
const express = require('express');
const { getOne, run } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();

function normalizeAiError(error) {
  if (!error) return 'Face operation failed';
  if (typeof error === 'object') {
    const detail = error.detail || error.error || error.message;
    if (detail) return normalizeAiError(detail);
    return JSON.stringify(error);
  }
  return String(error);
}

async function getStudentById(studentId) {
  return getOne(
    'SELECT s.*, u.full_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
    [studentId]
  );
}

async function markAttendance(student, classSectionId, result) {
  if (!classSectionId) return null;
  if (!result || result.decision !== 'APPROVED' || !result.liveness || !result.liveness.is_live) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const status = 'present';
  const existing = await getOne(
    'SELECT id, status FROM attendance_records WHERE student_id = $1 AND class_section_id = $2 AND date = $3',
    [student.id, classSectionId, today]
  );

  const params = [
    status,
    result.confidence || null,
    result.cosine_similarity || null,
    result.liveness && result.liveness.score ? result.liveness.score : null,
    result.pose && result.pose.yaw ? result.pose.yaw : null,
    result.pose && result.pose.pitch ? result.pose.pitch : null,
    result.pose && result.pose.roll ? result.pose.roll : null,
    result.pose && typeof result.pose.is_frontal !== 'undefined' ? String(result.pose.is_frontal) : null,
    result.decision || null,
    result.processing_time_ms || null
  ];

  if (existing) {
    await run(
      `UPDATE attendance_records
       SET status=$1, confidence_score=$2, cosine_similarity=$3, liveness_score=$4,
           pose_yaw=$5, pose_pitch=$6, pose_roll=$7, is_frontal=$8, decision=$9,
           processing_time_ms=$10, marked_by='ai', updated_at=CURRENT_TIMESTAMP
       WHERE id=$11`,
      params.concat(existing.id)
    );
  } else {
    await run(
      `INSERT INTO attendance_records
       (student_id, class_section_id, date, status, confidence_score, cosine_similarity,
        liveness_score, pose_yaw, pose_pitch, pose_roll, is_frontal, decision,
        processing_time_ms, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ai')`,
      [
        student.id,
        classSectionId,
        today,
        status,
        result.confidence || null,
        result.cosine_similarity || null,
        result.liveness && result.liveness.score ? result.liveness.score : null,
        result.pose && result.pose.yaw ? result.pose.yaw : null,
        result.pose && result.pose.pitch ? result.pose.pitch : null,
        result.pose && result.pose.roll ? result.pose.roll : null,
        result.pose && typeof result.pose.is_frontal !== 'undefined' ? String(result.pose.is_frontal) : null,
        result.decision || null,
        result.processing_time_ms || null
      ]
    );
  }

  return {
    status,
    already_marked: Boolean(existing),
    previous_status: existing ? existing.status : null
  };
}

async function sendVerificationResponse(res, result, classSectionId) {
  if (!result || !result.success) {
    return res.json({
      success: false,
      matched: false,
      attendance_marked: false,
      attendance_status: null,
      error: result ? normalizeAiError(result.error) : 'AI service error',
      stage_failed: result ? result.stage_failed : null,
      face_box: result ? result.face_box || null : null,
      video: result ? result.video : null
    });
  }

  const approvedLiveMatch = Boolean(
    result &&
    result.matched &&
    result.person_id &&
    result.decision === 'APPROVED' &&
    result.liveness &&
    result.liveness.is_live
  );

  if (!approvedLiveMatch) {
    const livenessDetail = result && result.liveness ? String(result.liveness.detail || '') : '';
    const likelySpoof = (
      result &&
      (
        result.review_required ||
        result.decision === 'PENDING_REVIEW' ||
        (result.liveness && result.liveness.is_live === false) ||
        /spoof|blink|not live/i.test(livenessDetail)
      )
    );

    return res.json({
      success: true,
      matched: false,
      attendance_marked: false,
      attendance_status: null,
      error: likelySpoof
        ? (result.error || 'Not live - spoof suspected')
        : 'Face not recognized',
      confidence: result.confidence || 0,
      cosine_similarity: result.cosine_similarity || 0,
      best_person_id: result.best_person_id || null,
      decision: result.decision || null,
      liveness: result.liveness,
      pose: result.pose,
      face_box: result.face_box || null,
      video: result.video || null,
      processing_time_ms: result.processing_time_ms
    });
  }

  const student = await getStudentById(parseInt(result.person_id));
  if (!student) {
    return res.json({
      success: true,
      matched: false,
      attendance_marked: false,
      attendance_status: null,
      error: 'Face matched but student not in database',
      person_id: result.person_id
    });
  }

  const attendance = await markAttendance(student, classSectionId, result);

  return res.json({
    success: true,
    matched: true,
    person_id: result.person_id,
    student_id: student.student_id,
    student_db_id: student.id,
    student_name: student.full_name,
    confidence: result.confidence,
    cosine_similarity: result.cosine_similarity,
    attendance_marked: Boolean(attendance),
    attendance_status: attendance ? attendance.status : null,
    already_marked: attendance ? attendance.already_marked : false,
    decision: result.decision,
    liveness: result.liveness,
    pose: result.pose,
    face_box: result.face_box || null,
    video: result.video || null,
    processing_time_ms: result.processing_time_ms
  });
}

router.post('/register', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    const studentId = req.body.student_id;
    const image = req.body.image;

    if (!studentId || !image) {
      return res.status(400).json({ error: 'student_id and image required' });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const result = await aiService.registerFace(
      String(student.id),
      student.full_name,
      image
    );

    if (!result.success) {
      return res.status(400).json({ error: normalizeAiError(result.error) });
    }

    await run(
      'UPDATE students SET face_registered = true, face_samples = COALESCE(face_samples, 0) + 1 WHERE id = $1',
      [studentId]
    );

    const updated = await getOne('SELECT face_samples FROM students WHERE id = $1', [studentId]);

    return res.json({
      success: true,
      student_id: student.student_id,
      student_name: student.full_name,
      face_samples: updated ? updated.face_samples : result.samples || 1,
      ai_samples: result.samples || 1
    });
  } catch (err) {
    console.error('[FACE REGISTER ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/register-video', authenticate, requireRole('admin', 'teacher'), async function(req, res) {
  try {
    const studentId = req.body.student_id;
    const frames = req.body.frames;
    const minSamples = req.body.min_samples || 3;

    if (!studentId || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'student_id and frames required' });
    }

    const student = await getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const result = await aiService.registerFaceVideo(
      String(student.id),
      student.full_name,
      frames,
      minSamples
    );

    if (!result.success) {
      return res.status(400).json({ error: normalizeAiError(result.error), details: result.error });
    }

    const added = result.added_samples || result.accepted_samples || frames.length;
    await run(
      'UPDATE students SET face_registered = true, face_samples = COALESCE(face_samples, 0) + $1 WHERE id = $2',
      [added, studentId]
    );

    const updated = await getOne('SELECT face_samples FROM students WHERE id = $1', [studentId]);

    return res.json({
      success: true,
      student_id: student.student_id,
      student_name: student.full_name,
      face_samples: updated ? updated.face_samples : result.samples,
      added_samples: added,
      accepted_samples: result.accepted_samples || added,
      rejected_frames: result.rejected_frames || [],
      time_ms: result.time_ms
    });
  } catch (err) {
    console.error('[FACE VIDEO REGISTER ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify', authenticate, async function(req, res) {
  try {
    const image = req.body.image;
    const classSectionId = req.body.class_section_id;

    if (!image) {
      return res.status(400).json({ error: 'image required' });
    }

    const result = await aiService.verifyFace(image);
    return sendVerificationResponse(res, result, classSectionId);
  } catch (err) {
    console.error('[FACE VERIFY ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-video', authenticate, async function(req, res) {
  try {
    const frames = req.body.frames;
    const classSectionId = req.body.class_section_id;

    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: 'frames required' });
    }

    const result = await aiService.verifyFaceVideo(frames);
    return sendVerificationResponse(res, result, classSectionId);
  } catch (err) {
    console.error('[FACE VIDEO VERIFY ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', authenticate, async function(req, res) {
  try {
    const aiStatus = await aiService.healthCheck();
    const total = await getOne('SELECT COUNT(*) as c FROM students');
    const registered = await getOne('SELECT COUNT(*) as c FROM students WHERE face_registered = true');
    res.json({
      ai_service: aiStatus.status || 'unknown',
      total_students: parseInt(total.c),
      faces_registered: parseInt(registered.c),
      ai_registered_faces: aiStatus.registered || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
