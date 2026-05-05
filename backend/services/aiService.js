const axios = require('axios');
const config = require('../config');

const aiClient = axios.create({
  baseURL: config.AI_SERVICE_URL,
  timeout: 30000
});

const aiService = {
  async healthCheck() {
    try {
      const res = await aiClient.get('/health');
      return res.data;
    } catch (err) {
      return { status: 'offline', error: err.message };
    }
  },

  async registerFace(personId, personName, imageBase64) {
    try {
      const res = await aiClient.post('/register/base64', {
        image: imageBase64,
        person_id: personId,
        person_name: personName
      });
      return res.data;
    } catch (err) {
      if (err.response) {
        return { success: false, error: err.response.data };
      }
      return { success: false, error: `AI service error: ${err.message}` };
    }
  },

  async registerFaceVideo(personId, personName, framesBase64, minSamples = 3) {
    try {
      const res = await aiClient.post('/register/video', {
        frames: framesBase64,
        person_id: personId,
        person_name: personName,
        min_samples: minSamples
      });
      return res.data;
    } catch (err) {
      if (err.response) {
        return { success: false, error: err.response.data };
      }
      return { success: false, error: `AI service error: ${err.message}` };
    }
  },

  async verifyFace(imageBase64) {
    try {
      const res = await aiClient.post('/verify/base64', {
        image: imageBase64
      });
      return res.data;
    } catch (err) {
      if (err.response) {
        return { success: false, error: err.response.data };
      }
      return { success: false, error: `AI service error: ${err.message}` };
    }
  },

  async verifyFaceVideo(framesBase64) {
    try {
      const res = await aiClient.post('/verify/video', {
        frames: framesBase64
      });
      return res.data;
    } catch (err) {
      if (err.response) {
        return { success: false, error: err.response.data };
      }
      return { success: false, error: `AI service error: ${err.message}` };
    }
  },

  async getRegisteredPersons() {
    try {
      const res = await aiClient.get('/persons');
      return res.data;
    } catch (err) {
      return { persons: [], error: err.message };
    }
  },

  async deletePerson(personId) {
    try {
      const res = await aiClient.delete(`/persons/${personId}`);
      return res.data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

module.exports = aiService;
