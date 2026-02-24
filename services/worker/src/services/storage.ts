import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError, NotFoundError } from "@imageops/core";
import type { WorkerConfig } from "../config";

/**
 * Convert a readable stream (Web ReadableStream<Uint8Array> or Node.js ReadableStream) into a single Buffer.
 *
 * @param stream - The source stream to read from; may be a web ReadableStream of Uint8Array or a Node.js ReadableStream.
 * @returns A Buffer containing all bytes read from the stream (empty if the stream has no data).
 */
async function streamToBuffer(stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream): Promise<Buffer> {
  if ("getReader" in stream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export interface WorkerStorageService {
  getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }>;
  putObjectBuffer(input: { objectKey: string; bytes: Buffer; contentType: string }): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
}

export class S3WorkerStorageService implements WorkerStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: WorkerConfig) {
    this.bucket = config.s3Bucket;
    this.client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey
      }
    });
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey
      })
    );

    if (!response.Body) {
      throw new AppError("STORAGE_ERROR", 500, `Object body missing for key: ${objectKey}`);
    }

    const bytes = await streamToBuffer(response.Body as ReadableStream<Uint8Array> | NodeJS.ReadableStream);
    return {
      bytes,
      contentType: response.ContentType || "application/octet-stream"
    };
  }

  async putObjectBuffer(input: { objectKey: string; bytes: Buffer; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
        Body: input.bytes,
        ContentType: input.contentType
      })
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey
      })
    );
  }
}

export class InMemoryWorkerStorageService implements WorkerStorageService {
  private readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  seedObject(objectKey: string, bytes: Buffer, contentType: string): void {
    this.objects.set(objectKey, { bytes, contentType });
  }

  getObject(objectKey: string): { bytes: Buffer; contentType: string } | undefined {
    return this.objects.get(objectKey);
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const object = this.objects.get(objectKey);
    if (!object) {
      throw new NotFoundError(`Object ${objectKey}`);
    }

    return object;
  }

  async putObjectBuffer(input: { objectKey: string; bytes: Buffer; contentType: string }): Promise<void> {
    this.objects.set(input.objectKey, { bytes: input.bytes, contentType: input.contentType });
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }
}
