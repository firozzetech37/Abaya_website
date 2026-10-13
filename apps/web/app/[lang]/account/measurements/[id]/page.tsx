import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MeasurementFormPage } from '@/components/account/measurement-form';
import { RequireAuth } from '@/components/account/require-auth';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { measurementForm } = (await stringsFor(params)).strings;
  return { title: measurementForm.metaTitleEdit, robots: { index: false } };
}

export default async function EditMeasurementPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <Suspense>
        <MeasurementFormPage id={id} />
      </Suspense>
    </RequireAuth>
  );
}
