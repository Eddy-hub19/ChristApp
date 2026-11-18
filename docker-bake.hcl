variable "IMAGE" {
  default = "ghcr.io/eddy-hub19/christapp"
}

variable "IMAGE_TAG" {
  default = "local"
}

variable "NEXT_PUBLIC_API_URL" {
  default = "http://localhost:3001"
}

variable "NEXT_PUBLIC_APP_URL" {
  default = "http://localhost:3000"
}

variable "NEXT_PUBLIC_WS_URL" {
  default = ""
}

variable "NEXT_PUBLIC_USE_DIRECT_API" {
  default = ""
}

variable "NEXT_PUBLIC_BIBLE_API_URL" {
  default = ""
}

variable "NEXT_PUBLIC_SITE_URL" {
  default = ""
}

variable "NEXT_PUBLIC_AGORA_APP_ID" {
  default = ""
}

variable "GIT_COMMIT_SHA" {
  default = ""
}

variable "BACKEND_PROXY_TARGET" {
  default = "http://backend:3001"
}

group "default" {
  targets = ["backend", "web"]
}

target "backend" {
  context    = "."
  dockerfile = "apps/backend/Dockerfile"
  target     = "production"
  tags       = ["${IMAGE}-backend:${IMAGE_TAG}"]
}

target "web" {
  context    = "."
  dockerfile = "apps/web/Dockerfile"
  target     = "production"
  tags       = ["${IMAGE}-web:${IMAGE_TAG}"]
  args = {
    NEXT_PUBLIC_API_URL        = NEXT_PUBLIC_API_URL
    NEXT_PUBLIC_APP_URL        = NEXT_PUBLIC_APP_URL
    NEXT_PUBLIC_WS_URL         = NEXT_PUBLIC_WS_URL
    NEXT_PUBLIC_USE_DIRECT_API = NEXT_PUBLIC_USE_DIRECT_API
    NEXT_PUBLIC_BIBLE_API_URL  = NEXT_PUBLIC_BIBLE_API_URL
    NEXT_PUBLIC_SITE_URL       = NEXT_PUBLIC_SITE_URL
    NEXT_PUBLIC_AGORA_APP_ID   = NEXT_PUBLIC_AGORA_APP_ID
    GIT_COMMIT_SHA             = GIT_COMMIT_SHA
    BACKEND_PROXY_TARGET       = BACKEND_PROXY_TARGET
  }
}
