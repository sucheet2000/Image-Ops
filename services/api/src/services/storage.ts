import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError, NotFoundError, ValidationError } from '@imageops/core';
import type { ApiConfig } from '../config';

export const TMP_PREFIX = 'tmp/';

export type StorageHeadResult = {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
};

export type DeleteObjectsResult = {
  deleted: string[];
  notFound: string[];
};

export type PresignedUploadPost = {
  url: string;
  fields: Record<string, string>;
};

export interface ObjectStorageService {
  createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes: number;
  }): Promise<PresignedUploadPost>;
  createPresignedDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
  getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }>;
  headObject(objectKey: string): Promise<StorageHeadResult>;
  deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult>;
  close(): Promise<void>;
}

export class S3ObjectStorageService implements ObjectStorageService {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(config: ApiConfig) {
    this.bucket = config.s3Bucket;
    this.client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint,
      forcePathStyle: config.s3ForcePathStyle,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
    });
    this.presignClient = config.s3PublicEndpoint
      ? new S3Client({
          region: config.s3Region,
          endpoint: config.s3PublicEndpoint,
          forcePathStyle: config.s3ForcePathStyle,
          credentials: {
            accessKeyId: config.s3AccessKey,
            secretAccessKey: config.s3SecretKey,
          },
        })
      : this.client;
  }

  async createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
    maxSizeBytes: number;
  }): Promise<PresignedUploadPost> {
    const presigned = await createPresignedPost(this.presignClient, {
      Bucket: this.bucket,
      Key: input.objectKey,
      Fields: {
        'Content-Type': input.contentType,
      },
      Conditions: [
        ['content-length-range', 1, input.maxSizeBytes],
        { 'Content-Type': input.contentType },
      ],
      Expires: input.expiresInSeconds,
    });

    return {
      url: presigned.url,
      fields: presigned.fields,
    };
  }

  async createPresignedDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
    });

    return getSignedUrl(this.presignClient, command, { expiresIn: input.expiresInSeconds });
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      })
    );

    const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) {
      throw new AppError('STORAGE_ERROR', 500, 'S3 getObject response body is missing bytes.');
    }

    const bytes = Buffer.from(await body.transformToByteArray());
    return {
      bytes,
      contentType: String(response.ContentType || 'application/octet-stream'),
    };
  }

  async headObject(objectKey: string): Promise<StorageHeadResult> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );

      return {
        exists: true,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if ((error instanceof Error && error.name === 'NotFound') || statusCode === 404) {
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
      throw new ValidationError(`Invalid object key prefix for deletion: ${invalid.join(', ')}`);
    }

    const response = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: objectKeys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      })
    );

    const deleted = (response.Deleted || []).map((item) => item.Key || '').filter(Boolean);
    const deletedSet = new Set(deleted);
    const notFound = objectKeys.filter((key) => !deletedSet.has(key));

    return { deleted, notFound };
  }

  async close(): Promise<void> {
    if (this.presignClient !== this.client) {
      this.presignClient.destroy();
    }
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
  }): Promise<PresignedUploadPost> {
    return {
      url: `https://memory.storage/upload/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}&maxSizeBytes=${input.maxSizeBytes}`,
      fields: {
        key: input.objectKey,
        'Content-Type': input.contentType,
      },
    };
  }

  async createPresignedDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return `https://memory.storage/download/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}`;
  }

  async getObjectBuffer(objectKey: string): Promise<{ bytes: Buffer; contentType: string }> {
    const object = this.objects.get(objectKey);
    if (!object) {
      throw new NotFoundError(`Object ${objectKey}`);
    }

    return {
      bytes: Buffer.from(object.bytes),
      contentType: object.contentType,
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
      contentLength: object.bytes.length,
    };
  }

  async deleteObjects(objectKeys: string[]): Promise<DeleteObjectsResult> {
    const invalid = objectKeys.filter((key) => !key.startsWith(TMP_PREFIX));
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid object key prefix for deletion: ${invalid.join(', ')}`);
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

  setObject(objectKey: string, contentType: string, bytes: Buffer = Buffer.from('test')): void {
    this.objects.set(objectKey, { contentType, bytes });
  }

  async close(): Promise<void> {}
}
