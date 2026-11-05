import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCampaignDto } from './marketing-campaigns.dto';
import { resolveFraming } from './marketing-campaigns.rules';

const errorsFor = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateCampaignDto, { revision: 0, ...body }))).map((e) => e.property);

describe('mobile framing validation', () => {
  it('accepts valid mobile fields and omitted ones', async () => {
    expect(await errorsFor({})).toEqual([]);
    expect(await errorsFor({ fitMobile: 'contain', focusMobileX: 0, focusMobileY: 100 })).toEqual([]);
  });

  it('rejects out-of-range focus and unknown fit', async () => {
    expect(await errorsFor({ focusMobileX: 101 })).toEqual(['focusMobileX']);
    expect(await errorsFor({ focusMobileY: -1 })).toEqual(['focusMobileY']);
    expect(await errorsFor({ focusMobileX: 10.5 })).toEqual(['focusMobileX']);
    expect(await errorsFor({ fitMobile: 'stretch' })).toEqual(['fitMobile']);
  });
});

describe('resolveFraming', () => {
  it('falls back to desktop values, then to 50/50 cover', () => {
    expect(resolveFraming({ fit: 'contain', focusX: 10, focusY: 90 })).toEqual({
      fit: 'contain', focusX: 10, focusY: 90, fitMobile: 'contain', focusMobileX: 10, focusMobileY: 90,
    });
    expect(resolveFraming({})).toMatchObject({ fit: 'cover', focusX: 50, focusMobileY: 50, fitMobile: 'cover' });
    expect(resolveFraming({ focusX: 10, focusMobileX: 70, fitMobile: 'contain' })).toMatchObject({ focusMobileX: 70, focusMobileY: 50, fitMobile: 'contain' });
  });
});
