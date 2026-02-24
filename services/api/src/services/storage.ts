import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiConfig } from "../config";

export const TMP_PREFIX = "tmp/";

export type StorageHeadResult = {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
};

export type DeleteObjectsResult = {
  deleted: string[];
  notFound: string[];
};

export interface ObjectStorageService {
  createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes: number;
  }): Promise<string>;
  createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string>;
  getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }>;
  headObject(objectKey: string): Promise<StorageHeadResult>;
  deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult>;
  close(): Promise<void>;
}

export class S3ObjectStorageService implements ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint?: string;

  constructor(config: ApiConfig) {
    this.bucket = config.s3Bucket;
    this.publicEndpoint = config.s3PublicEndpoint;
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

  private rewriteSignedUrlOrigin(signedUrl: string): string {
    if (!this.publicEndpoint) {
      return signedUrl;
    }

    try {
      const original = new URL(signedUrl);
      const publicEndpoint = new URL(this.publicEndpoint);
      original.protocol = publicEndpoint.protocol;
      original.username = publicEndpoint.username;
      original.password = publicEndpoint.password;
      original.host = publicEndpoint.host;
      return original.toString();
    } catch {
      return signedUrl;
    }
  }

  async createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes: number;
  }): Promise<string> {
    // Presigned PUT URLs cannot enforce content-length-range; validate size server-side during upload completion/job creation.
    void input.maxSizeBytes;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType
    });

    const signed = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    return this.rewriteSignedUrlOrigin(signed);
  }

  async createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey
    });

    const signed = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    return this.rewriteSignedUrlOrigin(signed);
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    }));

    const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) {
      throw new Error("S3 getObject response body is missing bytes.");
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    return {
      bytes,
      contentType: String(response.ContentType || "application/octet-stream")
    };
  }

  async headObject(objectKey: string): Promise<StorageHeadResult> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey
        })
      );

      return {
        exists: true,
        contentType: response.ContentType,
        contentLength: response.ContentLength
      };
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if ((error instanceof Error && error.name === "NotFound") || statusCode === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult> {
    if (objectKeys.length === 0) {
      return { deleted: [], notFound: [] };
    }

    const invalid = objectKeys.filter((key) => !key.startsWith(TMP_PREFIX));
    if (invalid.length > 0) {
      throw new Error(`Invalid object key prefix for deletion: ${invalid.join(", ")}`);
    }

    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: objectKeys.map((key) => ({ Key: key })),
          Quiet: false
        }
      })
    );

    const deleted = (response.Deleted || []).map((item) => item.Key || "").filter(Boolean);
    const deletedSet = new Set(deleted);
    const notFound = objectKeys.filter((key) => !deletedSet.has(key));

    return { deleted, notFound };
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}

export class InMemoryObjectStorageService implements ObjectStorageService {
  private readonly objects = new Map<string, { contentType: string; bytes: Buffer }>();

  async createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes: number;
  }): Promise<string> {
    return `https://memory.storage/upload/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}&contentType=${encodeURIComponent(input.contentType)}&maxSizeBytes=${input.maxSizeBytes}`;
  }

  async createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string> {
    return `https://memory.storage/download/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}`;
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const object = this.objects.get(objectKey);
    if (!object) {
      throw new Error(`Object not found: ${objectKey}`);
    }

    return {
      bytes: Buffer.from(object.bytes),
      contentType: object.contentType
    };
  }

  async headObject(objectKey: string): Promise<StorageHeadResult> {
    const object = this.objects.get(objectKey);
    if (!object) {
      return { exists: false };
    }

    return {
      exists: true,
      contentType: object.contentType,
      contentLength: object.bytes.length
    };
  }

  async deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult> {
    const invalid = objectKeys.filter((key) => !key.startsWith(TMP_PREFIX));
    if (invalid.length > 0) {
      throw new Error(`Invalid object key prefix for deletion: ${invalid.join(", ")}`);
    }

    const deleted: string[] = [];
    const notFound: string[] = [];

    for (const objectKey of objectKeys) {
      if (this.objects.delete(objectKey)) {
        deleted.push(objectKey);
      } else {
        notFound.push(objectKey);
      }
    }

    return { deleted, notFound };
  }

  setObject(objectKey: string, contentType: string, bytes: Buffer = Buffer.from("test")): void {
    this.objects.set(objectKey, { contentType, bytes });
  }

  async close(): Promise<void> {}
}
