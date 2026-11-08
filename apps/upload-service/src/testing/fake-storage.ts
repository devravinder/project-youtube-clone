import type { PresignedUrlOptions, PutObjectOptions, StoragePort, UploadedPart } from "@yt/ports";

interface MultipartSession {
  readonly bucket: string;
  readonly key: string;
  readonly parts: Map<number, number>;
}

// In-memory StoragePort; simulate* helpers play the browser.
export class FakeStorage implements StoragePort {
  readonly objects = new Map<string, number>();
  readonly sessions = new Map<string, MultipartSession>();
  readonly abortedUploads: string[] = [];
  private nextUploadId = 1;

  reset(): void {
    this.objects.clear();
    this.sessions.clear();
    this.abortedUploads.length = 0;
    this.nextUploadId = 1;
  }

  createPresignedUploadUrl(bucket: string, key: string, _options?: PresignedUrlOptions) {
    return Promise.resolve(`https://storage.test/${bucket}/${key}?signature=put`);
  }

  createPresignedDownloadUrl(bucket: string, key: string, _options?: PresignedUrlOptions) {
    return Promise.resolve(`https://storage.test/${bucket}/${key}?signature=get`);
  }

  getObject(): Promise<never> {
    return Promise.reject(new Error("not used in tests"));
  }

  putObject(bucket: string, key: string, body: Uint8Array, _options?: PutObjectOptions) {
    this.objects.set(`${bucket}/${key}`, body.byteLength);
    return Promise.resolve();
  }

  objectExists(bucket: string, key: string) {
    return Promise.resolve(this.objects.has(`${bucket}/${key}`));
  }

  deleteObject(bucket: string, key: string) {
    this.objects.delete(`${bucket}/${key}`);
    return Promise.resolve();
  }

  createMultipartUpload(bucket: string, key: string, _options?: PutObjectOptions) {
    const uploadId = `upload-${this.nextUploadId++}`;
    this.sessions.set(uploadId, { bucket, key, parts: new Map() });
    return Promise.resolve(uploadId);
  }

  createPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    _options?: PresignedUrlOptions,
  ) {
    return Promise.resolve(
      `https://storage.test/${bucket}/${key}?partNumber=${partNumber}&uploadId=${uploadId}`,
    );
  }

  listUploadedParts(_bucket: string, _key: string, uploadId: string): Promise<UploadedPart[]> {
    const session = this.session(uploadId);
    return Promise.resolve([...session.parts].map(([partNumber, size]) => ({ partNumber, size })));
  }

  completeMultipartUpload(bucket: string, key: string, uploadId: string) {
    const session = this.session(uploadId);
    const total = [...session.parts.values()].reduce((sum, size) => sum + size, 0);
    this.objects.set(`${bucket}/${key}`, total);
    this.sessions.delete(uploadId);
    return Promise.resolve();
  }

  abortMultipartUpload(_bucket: string, _key: string, uploadId: string) {
    this.sessions.delete(uploadId);
    this.abortedUploads.push(uploadId);
    return Promise.resolve();
  }

  simulatePut(bucket: string, key: string, size: number): void {
    this.objects.set(`${bucket}/${key}`, size);
  }

  simulatePartPut(uploadId: string, partNumber: number, size: number): void {
    this.session(uploadId).parts.set(partNumber, size);
  }

  // Real storage rejects finished or unknown uploads.
  private session(uploadId: string): MultipartSession {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw Object.assign(new Error("The specified upload does not exist"), {
        name: "NoSuchUpload",
      });
    }
    return session;
  }
}
