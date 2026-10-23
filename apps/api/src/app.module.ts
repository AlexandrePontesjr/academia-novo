import { createDatabase, type Database } from '@academia/database';
import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { AccessDeclarations, AccessGuard } from './access.ts';
import { AuditLogsController } from './audit/audit-logs.controller.ts';
import { AuditLogsService } from './audit/audit-logs.service.ts';
import { createAuth } from './auth.ts';
import { CheckInsController, StudentCheckInsController } from './check-ins/check-ins.controller.ts';
import { CheckInsService } from './check-ins/check-ins.service.ts';
import { AuthController } from './auth/auth.controller.ts';
import { LoginThrottle } from './auth/throttle.ts';
import { ConsentsController } from './consents/consents.controller.ts';
import { ConsentTermsController } from './consents/consent-terms.controller.ts';
import { ConsentsService } from './consents/consents.service.ts';
import { ColumnCipher } from './crypto.ts';
import { DashboardController } from './dashboard/dashboard.controller.ts';
import { DashboardService } from './dashboard/dashboard.service.ts';
import type { Env } from './env.ts';
import { HealthController } from './health.controller.ts';
import { LeadRetention } from './leads/lead-retention.ts';
import { LeadsGoogleController } from './leads/leads-google.controller.ts';
import { LeadsController } from './leads/leads.controller.ts';
import { LeadsService } from './leads/leads.service.ts';
import { MailService, type MailTransport, mailTransportFor } from './mail/mail.service.ts';
import { OpenApiController } from './openapi.controller.ts';
import { PhotoPurge } from './photos/photo-purge.ts';
import { PhotoSigner } from './photos/photo-signer.ts';
import { PhotoStorage } from './photos/photo-storage.ts';
import { PhotosController } from './photos/photos.controller.ts';
import { PhotosService } from './photos/photos.service.ts';
import { PlansController } from './plans/plans.controller.ts';
import { PlansService } from './plans/plans.service.ts';
import { PrivacyRetention } from './privacy/privacy-retention.ts';
import { PrivacySettingsController, StaffPrivacyController, StudentPrivacyController } from './privacy/privacy.controller.ts';
import { PrivacyService } from './privacy/privacy.service.ts';
import { ProblemFilter } from './problem.filter.ts';
import { StaffController } from './staff/staff.controller.ts';
import { StaffService } from './staff/staff.service.ts';
import { StudentEnrollmentsController } from './student-enrollments/student-enrollments.controller.ts';
import { StudentEnrollmentsService } from './student-enrollments/student-enrollments.service.ts';
import { PaymentsController, StudentPaymentsController } from './student-payments/student-payments.controller.ts';
import { StudentPaymentsService } from './student-payments/student-payments.service.ts';
import { StudentsController } from './students/students.controller.ts';
import { StudentsService } from './students/students.service.ts';
import { AUTH, DATABASE, ENV, MAIL_TRANSPORT } from './tokens.ts';
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
        StudentPaymentsController,
        PaymentsController,
        DashboardController,
        StudentCheckInsController,
        CheckInsController,
        StudentPrivacyController,
        StaffPrivacyController,
        PrivacySettingsController,
        LeadsController,
        LeadsGoogleController,
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
            new PhotosService(database.db, storage, signer),
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
          provide: StudentPaymentsService,
          useFactory: (database: Database) => new StudentPaymentsService(database.db),
          inject: [DATABASE],
        },
        {
          provide: CheckInsService,
          useFactory: (database: Database, photos: PhotosService) => new CheckInsService(database.db, photos),
          inject: [DATABASE, PhotosService],
        },
        {
          provide: DashboardService,
          useFactory: (database: Database) => new DashboardService(database.db),
          inject: [DATABASE],
        },
        {
          provide: ConsentsService,
          useFactory: (database: Database) => new ConsentsService(database.db),
          inject: [DATABASE],
        },
        {
          provide: PrivacyService,
          useFactory: (database: Database, storage: PhotoStorage) =>
            new PrivacyService(database.db, new ColumnCipher(env.DATA_ENCRYPTION_KEY), storage),
          inject: [DATABASE, PhotoStorage],
        },
        PrivacyRetention,
        LeadRetention,
        { provide: MAIL_TRANSPORT, useFactory: () => mailTransportFor(env) },
        {
          provide: MailService,
          useFactory: (transport: MailTransport) => new MailService(transport),
          inject: [MAIL_TRANSPORT],
        },
        {
          provide: LeadsService,
          useFactory: (database: Database, mail: MailService) =>
            new LeadsService(
              database.db,
              mail,
              new URL(env.WEB_ORIGIN).origin,
              env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined,
            ),
          inject: [DATABASE, MailService],
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
