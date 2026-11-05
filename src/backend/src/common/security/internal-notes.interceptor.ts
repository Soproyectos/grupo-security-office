import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { AccessContext } from '../acl/acl.service';
import { AccessAssignmentsService } from './access-assignments.service';
import { redactInternalNotes } from './internal-notes';

/**
 * Red de seguridad para TODAS las respuestas de un controlador de productos: ninguna respuesta
 * entrega `catalogInternalNotes` sin la concesion global `products:notes` (Super Admin la conserva).
 */
@Injectable()
export class RedactInternalNotesInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly grants?: AccessAssignmentsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest()?.user;
    const ctx: AccessContext = { userId: user?.sub ?? user?.id, roles: user?.roles ?? [], userName: user?.name ?? null };
    return next.handle().pipe(mergeMap((body) => from(redactInternalNotes(this.grants, ctx, body))));
  }
}
