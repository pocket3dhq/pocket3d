import { coveredInset } from './camera';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRectReadOnly;

describe('coveredInset', () => {
  const desktop = rect(0, 0, 1440, 900);
  const phone = rect(0, 0, 390, 844);

  it('takes the right for a panel down the right side', () => {
    expect(coveredInset(desktop, [rect(1084, 56, 340, 780)])).toEqual({ left: 0, right: 356, top: 0, bottom: 0 });
  });

  it('takes both sides for panels on the left and right', () => {
    const inset = coveredInset(desktop, [rect(16, 56, 300, 600), rect(1084, 56, 340, 780)]);
    expect(inset).toEqual({ left: 316, right: 356, top: 0, bottom: 0 });
  });

  it('takes the bottom for a sheet across a phone', () => {
    expect(coveredInset(phone, [rect(0, 336, 390, 508)])).toEqual({ left: 0, right: 0, top: 0, bottom: 508 });
  });

  it('ignores a panel off the canvas', () => {
    expect(coveredInset(desktop, [rect(1500, 0, 300, 900)])).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
});
