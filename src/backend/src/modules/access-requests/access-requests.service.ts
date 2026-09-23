import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';

export interface AccessRequestResponse {
  received: boolean;
}

@Injectable()
export class AccessRequestsService {
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
   * Extract client IP from request, handling proxies.
   */
  private extractIp(req: Request): string | undefined {
    // Check for X-Forwarded-For (common with proxies)
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    // Fall back to req.ip
    return req.ip;
  }

  /**
   * Create an access request (public endpoint).
   * Returns generic success response regardless of outcome to prevent enumeration.
   *
   * @param dto Access request data
   * @param req Express request (for IP extraction)
   * @returns Always returns { received: true }
   */
  async createPublic(
    dto: CreateAccessRequestDto,
    req: Request,
  ): Promise<AccessRequestResponse> {
    // Honeypot: if 'website' is non-empty, silently ignore
    if (dto.website) {
      return { received: true };
    }

    // Extract and hash IP
    const ipAddress = this.extractIp(req);
    const ipHash = this.hashIp(ipAddress);

    // Save the request (fire-and-forget, no await to minimize latency)
    this.createAccessRequest(dto, ipHash).catch((error) => {
      // Log but do not throw; response is already sent
      console.error('[AccessRequests] Error saving request:', error.message);
    });

    // Always respond with generic success
    return { received: true };
  }

  /**
   * Internal helper: create and persist the access request.
   */
  private async createAccessRequest(
    dto: CreateAccessRequestDto,
    ipHash: string | null,
  ): Promise<void> {
    await this.prisma.accessRequest.create({
      data: {
        companyName: dto.companyName,
        nit: dto.nit,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        customerType: dto.customerType as any, // Prisma enum
        ipHash,
        status: 'PENDING',
      },
    });
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
