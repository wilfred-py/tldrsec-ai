import { classifyRegion, regionCohortSlot } from '@/lib/email/region-classifier';

describe('classifyRegion', () => {
  describe('US (default)', () => {
    it.each([
      'wilf@gmail.com',
      'someone@yahoo.com',
      'a.b.c@hotmail.com',
      'user@outlook.com',
      'me@icloud.com',
      'retiree@aol.com',
      'investor@sbcglobal.net',
      'user@att.net',
      'user@cox.net',
      'user@cs.com',
      'user@bestformulations.com',
      'user@bergerchevy.com',
      'user@stark-stark.com',
      'user@ridenow.com',
      'user@ur.rochester.edu',
    ])('classifies %s as US', (email) => {
      expect(classifyRegion(email)).toBe('us');
    });
  });

  describe('EU (ccTLD)', () => {
    it.each([
      ['user@example.co.uk', 'co.uk'],
      ['user@firm.uk', 'uk'],
      ['user@example.de', 'de'],
      ['user@startup.fr', 'fr'],
      ['user@studio.it', 'it'],
      ['user@example.es', 'es'],
      ['user@example.nl', 'nl'],
      ['user@example.se', 'se'],
      ['user@example.no', 'no'],
      ['user@example.fi', 'fi'],
      ['user@example.dk', 'dk'],
      ['user@example.pl', 'pl'],
      ['user@example.ch', 'ch'],
      ['user@holzbau-roscher.at', 'at'],
      ['user@example.be', 'be'],
      ['user@example.ie', 'ie'],
      ['user@example.pt', 'pt'],
      ['user@example.cz', 'cz'],
      ['user@example.gr', 'gr'],
    ])('classifies %s as EU via %s ccTLD', (email) => {
      expect(classifyRegion(email)).toBe('eu');
    });
  });

  describe('EU (regional domain)', () => {
    it.each([
      'user@btinternet.com',
      'user@hotmail.co.uk',
      'user@yahoo.co.uk',
      'user@live.co.uk',
      'user@googlemail.com',
      'user@live.fr',
      'user@live.de',
      'user@web.de',
      'user@gmx.de',
      'user@wanadoo.fr',
      'user@orange.fr',
      'user@free.fr',
    ])('classifies %s as EU via known regional domain', (email) => {
      expect(classifyRegion(email)).toBe('eu');
    });
  });

  describe('edge cases', () => {
    it('handles uppercase email', () => {
      expect(classifyRegion('USER@EXAMPLE.CO.UK')).toBe('eu');
    });

    it.each(['', null as unknown as string, undefined as unknown as string, 'no-at-sign', 'trailing@'])(
      'defaults to US for malformed input: %p',
      (input) => {
        expect(classifyRegion(input)).toBe('us');
      }
    );

    it('handles +tagged addresses', () => {
      expect(classifyRegion('wilf+test@gmail.com')).toBe('us');
      expect(classifyRegion('wilf+test@btinternet.com')).toBe('eu');
    });
  });
});

describe('regionCohortSlot', () => {
  it('produces region-us / region-eu slots', () => {
    expect(regionCohortSlot('us')).toBe('region-us');
    expect(regionCohortSlot('eu')).toBe('region-eu');
  });
});
