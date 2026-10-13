import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, type Observable } from 'rxjs';
import { TRANSLATE_FIELDS } from '../../../common/i18n/translate-fields';
import { ContentTranslationService } from '../application/content-translation.service';
import { applyTranslations, textsToTranslate } from '../domain/content-localise';

/** How long a request waits for new catalog text to be translated before answering in English. */
const WAIT_MS = 3_000;

/**
 * For routes marked with @TranslateFields: when the site asks for Arabic (`?lang=ar`), those
 * fields of the response are swapped for their stored translations.
 */
@Injectable()
export class ContentTranslationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly translations: ContentTranslationService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const keys = this.reflector.getAllAndOverride<string[] | undefined>(TRANSLATE_FIELDS, [ctx.getHandler(), ctx.getClass()]);
    if (!keys?.length) return next.handle();
    const req = ctx.switchToHttp().getRequest<{ query?: Record<string, unknown> }>();
    if (req.query?.lang !== 'ar') return next.handle();
    const fields = new Set(keys);
    return next.handle().pipe(
      mergeMap((body: unknown) =>
        from(
          this.translations
            .translate(textsToTranslate(body, fields), 'ar', WAIT_MS)
            .then((map) => applyTranslations(body, fields, map))
            .catch(() => body),
        ),
      ),
    );
  }
}
