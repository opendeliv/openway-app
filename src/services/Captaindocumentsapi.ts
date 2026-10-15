import { api } from './api';

export type CaptainDocType =
  | 'AADHAAR'
  | 'SELFIE'
  | 'PAN'
  | 'DRIVING_LICENSE'
  | 'RC'
  | 'INSURANCE'
  | 'PERMIT'
  | 'VEHICLE_PHOTO';

export type UploadDocumentPayload = {
  type: CaptainDocType;
  fileUrl: string;
  documentNumber?: string;
};

export type PickedFile = {
  uri: string;
  name?: string;
  type?: string;
};

export const captainDocumentsApi = {
  /*
   * Image backend pe bhejta hai, backend Cloudinary pe upload karke
   * { url, publicId } deta hai. Hum sirf url return karte hain.
   */
  uploadFile: async (file: PickedFile): Promise<string> => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name ?? `doc_${Date.now()}.jpg`,
      type: file.type ?? 'image/jpeg',
    } as any);

    const response = await api.post<{ url: string }>(
      '/captain-documents/upload',
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data, // axios FormData ko na chhede
        timeout: 60000, // image upload me time lag sakta hai
      },
    );

    return response.data.url;
  },

  /* POST /captain-documents */
  upload: (data: UploadDocumentPayload) =>
    api.post('/captain-documents', data).then((response) => response.data),

  /* GET /captain-documents/my */
  getMyDocuments: () =>
    api.get('/captain-documents/my').then((response) => response.data),
};