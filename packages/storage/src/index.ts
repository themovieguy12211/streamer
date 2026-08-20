import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export interface StorageProvider { upload(key: string, body: Uint8Array | Buffer | Readable, contentType?: string): Promise<void>; download(key: string): Promise<Readable>; delete(key: string): Promise<void>; exists(key: string): Promise<boolean>; getSignedUrl(key: string, expiresIn?: number): Promise<string>; getObjectMetadata(key: string): Promise<{ contentLength?: number; contentType?: string }>; }
export class B2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  constructor(private readonly config: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }) { this.client = new S3Client({ endpoint: config.endpoint, region: config.region, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }); }
  async upload(key: string, body: Uint8Array | Buffer | Readable, contentType?: string) { await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType })); }
  async download(key: string) { const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key })); if (!result.Body) throw new Error(`Storage object ${key} has no body`); return result.Body as Readable; }
  async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })); }
  async exists(key: string) { try { await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })); return true; } catch { return false; } }
  async getSignedUrl(key: string, expiresIn = 900) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn }); }
  async getObjectMetadata(key: string) { const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })); return { contentLength: result.ContentLength, contentType: result.ContentType }; }
  uploadUrl(key: string, contentType: string, expiresIn = 3600) { return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType }), { expiresIn }); }
}
