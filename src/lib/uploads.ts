const CV_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf"
};

const DOCUMENT_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ...CV_CONTENT_TYPES_BY_EXTENSION,
  txt: "text/plain"
};

const CV_ALLOWED_CONTENT_TYPES = new Set(Object.values(CV_CONTENT_TYPES_BY_EXTENSION));
const DOCUMENT_ALLOWED_CONTENT_TYPES = new Set(
  Object.values(DOCUMENT_CONTENT_TYPES_BY_EXTENSION)
);

export const CV_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// We accept any file type now. Downloads are forced via Content-Disposition
// so even an HTML-spoofed file can't render inline from the S3 origin.
export const DOCUMENT_UPLOAD_ACCEPT = "*";

export const CV_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const CV_UPLOAD_FORMAT_LABEL = "Всеки файлов формат, до 50 MB общо";

export const DOCUMENT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const DOCUMENT_UPLOAD_TOTAL_BYTES = 50 * 1024 * 1024;
export const DOCUMENT_UPLOAD_FORMAT_LABEL = "Всеки файлов формат, до 50 MB общо";
export const DOCUMENT_UPLOAD_MAX_COUNT = 50;

function getFileExtension(fileName: string) {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

export function getCvUploadContentType(file: Pick<File, "name" | "type">) {
  const type = file.type.trim().toLowerCase();

  if (CV_ALLOWED_CONTENT_TYPES.has(type)) {
    return type;
  }

  return CV_CONTENT_TYPES_BY_EXTENSION[getFileExtension(file.name)] || "application/octet-stream";
}

export function getCvUploadValidationError(file: Pick<File, "name" | "size" | "type">) {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Файлът изглежда празен.";
  }

  if (file.size > CV_UPLOAD_MAX_BYTES) {
    return "Файлът надвишава 50 MB.";
  }

  return "";
}

export function getDocumentUploadContentType(file: Pick<File, "name" | "type">) {
  const type = file.type.trim().toLowerCase();

  if (DOCUMENT_ALLOWED_CONTENT_TYPES.has(type)) {
    return type;
  }

  return (
    DOCUMENT_CONTENT_TYPES_BY_EXTENSION[getFileExtension(file.name)] ||
    "application/octet-stream"
  );
}

export function getDocumentUploadValidationError(
  file: Pick<File, "name" | "size" | "type">
) {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Файлът изглежда празен.";
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return "Файлът надвишава 50 MB.";
  }

  return "";
}
