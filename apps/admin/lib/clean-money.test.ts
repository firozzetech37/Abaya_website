import { describe, expect, it } from 'vitest';
import { cleanMoneyInput } from '@/components/ui/input';

describe('cleanMoneyInput', () => {
  it('keeps digits and one decimal point with two decimals', () => {
    expect(cleanMoneyInput('4000')).toBe('4000');
    expect(cleanMoneyInput('4,000')).toBe('4000');
    expect(cleanMoneyInput('12.345')).toBe('12.34');
    expect(cleanMoneyInput('1.2.3')).toBe('1.23');
    expect(cleanMoneyInput('abc')).toBe('');
    expect(cleanMoneyInput('-50')).toBe('50');
  });
  it('drops leading zeros and caps at the maximum', () => {
    expect(cleanMoneyInput('007')).toBe('7');
    expect(cleanMoneyInput('0.5')).toBe('0.5');
    expect(cleanMoneyInput('110500')).toBe('110500');
    expect(cleanMoneyInput('999', 500)).toBe('500');
    // Only the database's own ceiling remains
    expect(cleanMoneyInput('99999999999')).toBe('21474836');
  });
});
