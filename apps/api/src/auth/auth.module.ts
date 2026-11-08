import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { UserGuard } from './user.guard';
import { UsersService } from './users.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [UsersService, { provide: APP_GUARD, useClass: UserGuard }],
  exports: [UsersService],
})
export class AuthModule {}
