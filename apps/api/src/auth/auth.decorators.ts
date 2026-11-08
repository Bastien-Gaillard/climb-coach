import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { User } from './users.service';

export const IS_PUBLIC = 'isPublic';

/** Route accessible sans être connecté (santé de l'API, connexion). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Utilisateur connecté, posé sur la requête par UserGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => ctx.switchToHttp().getRequest().user,
);
