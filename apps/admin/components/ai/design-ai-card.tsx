'use client';

import type { AdminDesignDetail } from '@abaya/contracts';
import { useCurrentUser } from '@/lib/current-user';
import { useApplyDesignAi, useDesignAi, useDismissDesignAi } from '@/lib/queries/ai';
import { AiPanel } from './ai-panel';

/** AI assistant for one design: suggested tags/style/alt text and look-alike designs. */
export function DesignAiCard({ design, className }: { design: AdminDesignDetail; className?: string }) {
  const me = useCurrentUser();
  const query = useDesignAi(design.id);
  const apply = useApplyDesignAi(design.id);
  const dismiss = useDismissDesignAi(design.id);
  return (
    <AiPanel
      className={className}
      query={query}
      canEdit={me.can('editDesigns')}
      applying={apply.isPending}
      dismissing={dismiss.isPending}
      onApply={(choice) => apply.mutateAsync(choice)}
      onDismiss={() => dismiss.mutateAsync()}
    />
  );
}
