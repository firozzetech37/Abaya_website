import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MeasurementFormPage } from '@/components/account/measurement-form';
import { RequireAuth } from '@/components/account/require-auth';
import { stringsFor } from '@/content/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { measurementForm } = (await stringsFor(params)).strings;
  return { title: measurementForm.metaTitleNew, robots: { index: false } };
}

export default function NewMeasurementPage() {
  return (
    <RequireAuth>
      <Suspense>
        <MeasurementFormPage />
      </Suspense>
    </RequireAuth>
  );
}
