import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';
import { AccessRequestStatus } from './dto/update-access-request-status.dto';

export interface AccessRequestResponse {
  received: boolean;
}

@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Hash the client IP address using HMAC-SHA256 keyed with a server secret.
   * A plain SHA256 of an IP is trivially reversible by brute force (IPv4
   * space is only ~4.3 billion values); HMAC with a secret salt makes that
   * infeasible. Never store raw IP in the database.
   *
   * Fail-safe: if the salt is not configured, store null instead of falling
   * back to an unsalted (reversible) hash.
   */
  private hashIp(ipAddress: string | undefined): string | null {
    if (!ipAddress) return null;

    const salt = this.config.get<string>('ACCESS_REQUEST_IP_SALT');
    if (!salt) {
      this.logger.warn(
        'ACCESS_REQUEST_IP_SALT no configurado: ipHash se omite (null) en vez de usar un hash sin salt.',
      );
      return null;
    }

    return crypto.createHmac('sha256', salt).update(ipAddress).digest('hex');
  }

  /**
   * Create an access request (public endpoint).
   * Returns generic success response to prevent enumeration.
   * Only swallows errors silently for honeypot; real submissions throw on DB failure.
   *
   * @param dto Access request data
   * @param req Express request (IP extracted via app.set('trust proxy', <n>) + reverse proxy)
   * @returns Always returns { received: true }
   * @throws InternalServerErrorException if real (non-honeypot) submission fails
   */
  async createPublic(
    dto: CreateAccessRequestDto,
    req: Request,
  ): Promise<AccessRequestResponse> {
    // Honeypot: if 'website' is non-empty, silently ignore without saving
    if (dto.website) {
      return { received: true };
    }

    // Extract IP from request (Express trusts proxy via app.set('trust proxy', <n>))
    // Reverse proxy (nginx) sets X-Forwarded-For and X-Real-IP headers
    const ipAddress = req.ip;
    const ipHash = this.hashIp(ipAddress);

    // Correlation id for on-call debugging: ties a log line back to this
    // specific request without logging any PII (email/nit/ipHash).
    const correlationId = crypto.randomUUID();

    try {
      await this.prisma.accessRequest.create({
        data: {
          companyName: dto.companyName,
          nit: dto.nit,
          contactName: dto.contactName,
          email: dto.email,
          phone: dto.phone,
          customerType: dto.customerType as any,
          ipHash,
          status: 'PENDING',
        },
      });
    } catch (error: any) {
      // Log error without PII (only code/message + correlation id)
      this.logger.error(
        `Failed to save access request [${correlationId}]: ${error.code || error.message}`,
      );
      // Throw so frontend can retry; never silently drop real submissions
      throw new InternalServerErrorException('Error processing request. Please try again.');
    }

    // Always respond with generic success
    return { received: true };
  }

  /**
   * List all access requests (paginated, filterable by status).
   * Protected endpoint: requires staff auth and permission.
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: AccessRequestStatus,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const where = status ? { status: status as any } : {};

    const [data, total] = await Promise.all([
      this.prisma.accessRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.accessRequest.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Update the status of an access request (approve/reject).
   * Protected endpoint: requires staff auth and permission.
   */
  async updateStatus(
    id: string,
    newStatus: AccessRequestStatus,
    reviewedById: string,
  ): Promise<any> {
    try {
      return await this.prisma.accessRequest.update({
        where: { id },
        data: {
          status: newStatus as any,
          reviewedById,
          reviewedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Solicitud de acceso no encontrada');
      }
      throw error;
    }
  }
}
