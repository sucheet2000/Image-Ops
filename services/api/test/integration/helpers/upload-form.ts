export function buildUploadFormData(
  fields: Record<string, string>,
  fileBytes: Buffer,
  filename: string,
  mimeType: string
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    formData.append(key, value);
  }
  if (!fields?.["Content-Type"]) {
    formData.append("Content-Type", mimeType);
  }
  formData.append("file", new Blob([fileBytes], { type: mimeType }), filename);
  return formData;
}
