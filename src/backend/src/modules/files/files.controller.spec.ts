import { NotFoundException } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: jest.Mocked<Pick<FilesService, 'get'>>;

  const buildRes = () => {
    const res: any = {
      headers: {} as Record<string, string>,
      set(headers: Record<string, string>) {
        Object.assign(this.headers, headers);
        return this;
      },
      send: jest.fn(),
    };
    return res;
  };

  beforeEach(() => {
    filesService = { get: jest.fn() };
    controller = new FilesController(filesService as unknown as FilesService);
  });

  it('sirve el archivo con Content-Type, Cache-Control y CORP cross-origin', async () => {
    const data = Buffer.from('png-bytes');
    filesService.get.mockResolvedValue({ mimeType: 'image/png', data } as any);
    const res = buildRes();

    await controller.serve('file-id', res);

    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(res.send).toHaveBeenCalledWith(data);
  });

  it('lanza 404 cuando el archivo no existe', async () => {
    filesService.get.mockResolvedValue(null as any);
    await expect(controller.serve('missing', buildRes())).rejects.toThrow(NotFoundException);
  });
});
