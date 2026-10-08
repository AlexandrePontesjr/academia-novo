import { createDatabase, type Database } from '@academia/database';
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AccessDeclarations, AccessGuard } from './access.ts';
import { AuditLogsController } from './audit/audit-logs.controller.ts';
import { AuditLogsService } from './audit/audit-logs.service.ts';
import { createAuth } from './auth.ts';
import { AuthController } from './auth/auth.controller.ts';
import { LoginThrottle } from './auth/throttle.ts';
import { ConsentsController } from './consents/consents.controller.ts';
import { ConsentTermsController } from './consents/consent-terms.controller.ts';
import { ConsentsService } from './consents/consents.service.ts';
import { ColumnCipher } from './crypto.ts';
import type { Env } from './env.ts';
import { HealthController } from './health.controller.ts';
import { OpenApiController } from './openapi.controller.ts';
import { PhotoPurge } from './photos/photo-purge.ts';
import { PhotoSigner } from './photos/photo-signer.ts';
import { PhotoStorage } from './photos/photo-storage.ts';
import { PhotosController } from './photos/photos.controller.ts';
import { PhotosService } from './photos/photos.service.ts';
import { PlansController } from './plans/plans.controller.ts';
import { PlansService } from './plans/plans.service.ts';
import { ProblemFilter } from './problem.filter.ts';
import { StaffController } from './staff/staff.controller.ts';
import { StaffService } from './staff/staff.service.ts';
import { StudentEnrollmentsController } from './student-enrollments/student-enrollments.controller.ts';
import { StudentEnrollmentsService } from './student-enrollments/student-enrollments.service.ts';
import { StudentsController } from './students/students.controller.ts';
import { StudentsService } from './students/students.service.ts';
import { AUTH, DATABASE, ENV } from './tokens.ts';
import { UsersController } from './users/users.controller.ts';
import { UsersService } from './users/users.service.ts';
import { ValidationInterceptor } from './validation.ts';

/** O `/health` tem de responder antes dos 3 s que o web espera por ele. */
const DATABASE_TIMEOUT_MS = 2000;

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [DiscoveryModule],
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        AuditLogsController,
        StudentsController,
        StaffController,
        ConsentsController,
        ConsentTermsController,
        PhotosController,
        PlansController,
        StudentEnrollmentsController,
        OpenApiController,
      ],
      providers: [
        { provide: ENV, useValue: env },
        {
          provide: DATABASE,
          useFactory: () => createDatabase(env.DATABASE_URL, { timeoutMs: DATABASE_TIMEOUT_MS }),
        },
        {
          provide: AUTH,
          useFactory: (database: Database) =>
            createAuth(database.db, { secret: env.AUTH_SECRET, webOrigin: env.WEB_ORIGIN }),
          inject: [DATABASE],
        },
        {
          provide: UsersService,
          useFactory: (database: Database) => new UsersService(database.db),
          inject: [DATABASE],
        },
        {
          provide: StudentsService,
          useFactory: (database: Database) =>
            new StudentsService(database.db, new ColumnCipher(env.DATA_ENCRYPTION_KEY)),
          inject: [DATABASE],
        },
        {
          provide: StaffService,
          useFactory: (database: Database) => new StaffService(database.db),
          inject: [DATABASE],
        },
        { provide: PhotoStorage, useFactory: () => new PhotoStorage(env) },
        { provide: PhotoSigner, useFactory: () => new PhotoSigner(env.PHOTO_URL_SECRET) },
        {
          provide: PhotosService,
          useFactory: (database: Database, storage: PhotoStorage, signer: PhotoSigner) =>
            new PhotosService(database.db, storage, signer, env.PHOTO_VERSION_RETENTION_DAYS),
          inject: [DATABASE, PhotoStorage, PhotoSigner],
        },
        PhotoPurge,
        {
          provide: PlansService,
          useFactory: (database: Database) => new PlansService(database.db),
          inject: [DATABASE],
        },
        {
          provide: StudentEnrollmentsService,
          useFactory: (database: Database) => new StudentEnrollmentsService(database.db),
          inject: [DATABASE],
        },
        {
          provide: ConsentsService,
          useFactory: (database: Database) => new ConsentsService(database.db),
          inject: [DATABASE],
        },
        {
          provide: AuditLogsService,
          useFactory: (database: Database) => new AuditLogsService(database.db),
          inject: [DATABASE],
        },
        {
          provide: LoginThrottle,
          useFactory: (database: Database) => new LoginThrottle(database.db),
          inject: [DATABASE],
        },
        AccessDeclarations,
        { provide: APP_FILTER, useClass: ProblemFilter },
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_INTERCEPTOR, useClass: ValidationInterceptor },
      ],
    };
  }

  async onApplicationShutdown() {
    await this.database.close();
  }
}
