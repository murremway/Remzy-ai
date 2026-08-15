terraform {
  required_version = ">= 1.6.0"
}

variable "project" {
  type    = string
  default = "remzyforge"
}

output "note" {
  value = "Phase 10: provision GPU node pools, Postgres, Redis, and S3 here."
}
