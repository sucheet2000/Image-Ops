import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiConfig } from "../config";

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
  createPresignedUploadUrl(input: { objectKey: string; contentType: string; expiresInSeconds: number }): Promise<string>;
  createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string>;
  headObject(objectKey: string): Promise<StorageHeadResult>;
  deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult>;
  close(): Promise<void>;
}

export class S3ObjectStorageService implements ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ApiConfig) {
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

  async createPresignedUploadUrl(input: { objectKey: string; contentType: string; expiresInSeconds: number }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType
    });

    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  async createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey
    });

    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
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
      if (error instanceof Error && /not.?found/i.test(error.message)) {
        return { exists: false };
      }
      return { exists: false };
    }
  }

  async deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult> {
    if (objectKeys.length === 0) {
      return { deleted: [], notFound: [] };
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

  async createPresignedUploadUrl(input: { objectKey: string; contentType: string; expiresInSeconds: number }): Promise<string> {
    return `https://memory.storage/upload/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}&contentType=${encodeURIComponent(input.contentType)}`;
  }

  async createPresignedDownloadUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string> {
    return `https://memory.storage/download/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}`;
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
