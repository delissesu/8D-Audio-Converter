# adapters/web/openapi_spec.py
# OpenAPI 3.0 descriptor for the REST API.

OPENAPI_SPEC = {
    "openapi": "3.0.0",
    "info": {
        "title": "8D Audio Converter API",
        "description": "Programmatic access to the 8D audio spatialization engine.",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "/api/v1",
            "description": "API V1"
        }
    ],
    "components": {
        "securitySchemes": {
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer"
            }
        }
    },
    "security": [
        {
            "bearerAuth": []
        }
    ],
    "paths": {
        "/convert": {
            "post": {
                "summary": "Start an audio conversion job",
                "requestBody": {
                    "required": True,
                    "content": {
                        "multipart/form-data": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "file": {
                                        "type": "string",
                                        "format": "binary",
                                        "description": "The audio file to convert (max 100MB)."
                                    },
                                    "format": {
                                        "type": "string",
                                        "enum": ["mp3", "wav", "flac", "ogg", "aac", "m4a"],
                                        "default": "mp3"
                                    },
                                    "speed": {"type": "number", "default": 0.15},
                                    "depth": {"type": "number", "default": 1.0},
                                    "room": {"type": "number", "default": 0.4},
                                    "wet": {"type": "number", "default": 0.3},
                                    "damping": {"type": "number", "default": 0.5},
                                    "effects[]": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                        "description": "List of effect IDs (e.g., 8d_rotate, reverb, stereo_width, vinyl_warmth)"
                                    },
                                    "trim_start": {"type": "number", "default": 0},
                                    "trim_end": {"type": "number", "default": 0}
                                },
                                "required": ["file"]
                            }
                        }
                    }
                },
                "responses": {
                    "202": {
                        "description": "Job created",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "jobId": {"type": "string", "example": "123e4567-e89b-12d3-a456-426614174000"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "/status/{job_id}": {
            "get": {
                "summary": "Check job status",
                "parameters": [
                    {
                        "name": "job_id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"}
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Job status",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {"type": "string", "enum": ["processing", "done", "error", "unknown"]},
                                        "progress": {"type": "integer", "minimum": 0, "maximum": 100},
                                        "step": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "/download/{job_id}": {
            "get": {
                "summary": "Download completed audio",
                "parameters": [
                    {
                        "name": "job_id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"}
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Audio file",
                        "content": {
                            "audio/*": {}
                        }
                    },
                    "202": {
                        "description": "Job still processing"
                    },
                    "404": {
                        "description": "Job not found or failed"
                    }
                }
            }
        }
    }
}
