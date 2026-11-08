import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, Public } from './auth.decorators';
import { User, UsersService } from './users.service';

const LoginSchema = z.object({ username: z.string().trim().min(1).max(40) });

const toDto = (u: User) => ({ id: u.id, username: u.username });

@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  /** Vérifie que le compte existe. Les comptes se créent côté serveur, pas depuis l'appli. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: z.infer<typeof LoginSchema>) {
    const user = await this.users.findByUsername(body.username);
    if (!user) throw new UnauthorizedException(`Aucun compte « ${body.username.trim()} »`);
    return toDto(user);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return toDto(user);
  }
}
