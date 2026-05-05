"""Face embedding storage with error recovery."""

import json
import os
import shutil
import numpy as np
from typing import List, Tuple, Optional
from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class FaceDatabase:

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("db", config.LOG_FILE, config.LOG_LEVEL)
        self.db_path = os.path.join(config.REGISTERED_FACES_DIR, "embeddings.json")
        self.backup_path = self.db_path + ".backup"
        self.data = {}
        self._load()

    def _load(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path) as f:
                    self.data = json.load(f)
                self.logger.info(f"Loaded {len(self.data)} persons")
            except (json.JSONDecodeError, Exception) as e:
                self.logger.error(f"DB corrupted: {e}, trying backup")
                if os.path.exists(self.backup_path):
                    try:
                        with open(self.backup_path) as f:
                            self.data = json.load(f)
                        self.logger.info(f"Restored from backup: {len(self.data)} persons")
                    except Exception:
                        self.data = {}
                        self.logger.error("Backup also corrupted, starting fresh")
                else:
                    self.data = {}

    def _save(self):
        try:
            # Backup current file first
            if os.path.exists(self.db_path):
                shutil.copy2(self.db_path, self.backup_path)
            # Write new data
            with open(self.db_path, "w") as f:
                json.dump(self.data, f, indent=2)
        except Exception as e:
            self.logger.error(f"DB save failed: {e}")

    def _embedding_to_list(self, emb: np.ndarray) -> list:
        arr = np.array(emb, dtype=float)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        return arr.tolist()

    def register(self, pid: str, name: str, emb: np.ndarray,
                 meta: dict = None) -> dict:
        el = self._embedding_to_list(emb)
        if pid in self.data:
            self.data[pid]["embeddings"].append(el)
            self.data[pid]["num_samples"] = len(self.data[pid]["embeddings"])
            action = "updated"
        else:
            self.data[pid] = {
                "name": name, "embeddings": [el],
                "num_samples": 1, "meta": meta or {}
            }
            action = "registered"
        self._save()
        self.logger.info(f"{action}: {name} ({pid})")
        return {
            "success": True, "action": action, "person_id": pid,
            "person_name": name,
            "samples": len(self.data[pid]["embeddings"])
        }

    def register_many(self, pid: str, name: str, embeddings: List[np.ndarray],
                      meta: dict = None) -> dict:
        if not embeddings:
            return {
                "success": False, "error": "No embeddings provided",
                "person_id": pid, "person_name": name, "samples": 0,
                "added_samples": 0
            }

        clean_embeddings = [self._embedding_to_list(e) for e in embeddings]
        if pid in self.data:
            self.data[pid]["embeddings"].extend(clean_embeddings)
            self.data[pid]["num_samples"] = len(self.data[pid]["embeddings"])
            action = "updated"
        else:
            self.data[pid] = {
                "name": name, "embeddings": clean_embeddings,
                "num_samples": len(clean_embeddings), "meta": meta or {}
            }
            action = "registered"

        self._save()
        self.logger.info(f"{action}: {name} ({pid}) +{len(clean_embeddings)} samples")
        return {
            "success": True, "action": action, "person_id": pid,
            "person_name": name,
            "samples": len(self.data[pid]["embeddings"]),
            "added_samples": len(clean_embeddings)
        }

    def get_all_embeddings(self) -> List[Tuple[str, np.ndarray]]:
        out = []
        for pid, d in self.data.items():
            try:
                for e in d["embeddings"]:
                    arr = np.array(e, dtype=float)
                    norm = np.linalg.norm(arr)
                    if norm > 0:
                        arr = arr / norm
                    out.append((pid, arr))
            except Exception as e:
                self.logger.warning(f"Bad embedding for {pid}: {e}")
        return out

    def get_person(self, pid: str) -> Optional[dict]:
        d = self.data.get(pid)
        if not d:
            return None
        return {
            "person_id": pid, "person_name": d["name"],
            "num_samples": d["num_samples"], "meta": d.get("meta", {})
        }

    def delete(self, pid: str) -> bool:
        if pid in self.data:
            del self.data[pid]
            self._save()
            return True
        return False

    def list_all(self) -> list:
        return [
            {"person_id": k, "person_name": v["name"], "num_samples": v["num_samples"]}
            for k, v in self.data.items()
        ]

    def total(self) -> int:
        return len(self.data)
