import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';

export interface AccessRequestResponse {
  received: boolean;
}

@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Hash the client IP address using SHA256.
   * Never store raw IP in the database.
   */
  private hashIp(ipAddress: string | undefined): string | null {
    if (!ipAddress) return null;
    return crypto.createHash('sha256').update(ipAddress).digest('hex');
  }

  /**
   * Create an access request (public endpoint).
   * Returns generic success response to prevent enumeration.
   * Only swallows errors silently for honeypot; real submissions throw on DB failure.
   *
   * @param dto Access request data
   * @param req Express request (IP extracted via app.set('trust proxy', 1) + nginx)
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

    // Extract IP from request (Express trusts proxy via app.set('trust proxy', 1))
    // nginx sets X-Forwarded-For and X-Real-IP headers
    const ipAddress = req.ip;
    const ipHash = this.hashIp(ipAddress);

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
      // Log error without PII (only code/message)
      this.logger.error(`Failed to save access request: ${error.code || error.message}`);
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
    status?: string,
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
    newStatus: string,
    reviewedById: string,
  ): Promise<any> {
    return this.prisma.accessRequest.update({
      where: { id },
      data: {
        status: newStatus as any,
        reviewedById,
        reviewedAt: new Date(),
      },
    });
  }
}
