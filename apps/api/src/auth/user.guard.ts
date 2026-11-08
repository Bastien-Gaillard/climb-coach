import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './auth.decorators';
import { UsersService } from './users.service';

/** En-tête envoyé par le front avec le nom du compte connecté. */
export const USER_HEADER = 'x-user';

/**
 * Identifie le compte à chaque requête à partir de l'en-tête X-User.
 * Volontairement simple : pas de mot de passe, l'appli n'est joignable que via Tailscale.
 */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers[USER_HEADER];
    const user = typeof raw === 'string' ? await this.users.findByUsername(raw) : undefined;
    if (!user) throw new UnauthorizedException('Compte inconnu : reconnecte-toi');
    req.user = user;
    return true;
  }
}
