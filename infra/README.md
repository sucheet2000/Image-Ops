# Infra Notes

## Required S3 Bucket Settings for Presigned Upload POST

- Block all public access: enabled.
- Public bucket ACLs: disabled (no public ACL).
- CORS: allow `POST` from `WEB_ORIGIN` only and expose `ETag`.
- Lifecycle: expire objects under `uploads/` after 1 day (24 hours).

Example CORS rule:

```json
[
  {
    "AllowedOrigins": ["https://your-web-origin.example.com"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Example lifecycle rule:

```json
{
  "Rules": [
    {
      "ID": "expire-abandoned-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "uploads/" },
      "Expiration": { "Days": 1 }
    }
  ]
}
```
