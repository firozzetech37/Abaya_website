'use client';

import type { ImageCheckResultDto } from '@abaya/contracts';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api-client';
import { uploadImage } from '../upload';

/** Uploads the picture to the private bucket, then asks the API to read our watermark (the file is deleted after). */
export function useCheckImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadImage(file, 'IMAGE_CHECK');
      return api.post<ImageCheckResultDto>('/admin/image-checks', { path });
    },
  });
}
