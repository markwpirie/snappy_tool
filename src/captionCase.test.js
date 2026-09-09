import { describe, it, expect } from 'vitest';
import { properCaseCaption } from './captionCase.js';

describe('properCaseCaption', () => {
  it('leaves an empty/undefined caption alone', () => {
    expect(properCaseCaption('')).toBe('');
    expect(properCaseCaption(undefined)).toBe(undefined);
  });

  it('title-cases ordinary words and lowercases small words unless first', () => {
    expect(properCaseCaption('general equipment locations')).toBe('General Equipment Locations');
    expect(properCaseCaption('looking at vacuum unit cable penetration from below')).toBe(
      'Looking at Vacuum Unit Cable Penetration from Below'
    );
  });

  it('preserves drawing numbers and ratings exactly as typed — it never invents casing they didn\'t type', () => {
    expect(properCaseCaption('cable block diagram WCE-ES-158-C19-0001-01-00D')).toBe(
      'Cable Block Diagram WCE-ES-158-C19-0001-01-00D'
    );
    // typed with the natural rating/label casing a user would actually use
    expect(properCaseCaption('upper deck - junction box with 440V em supply, 3c120 looking aft')).toBe(
      'Upper Deck - Junction Box with 440V Em Supply, 3c120 Looking AFT'
    );
  });

  it('preserves all-uppercase acronyms and tags, including a lone letter', () => {
    expect(properCaseCaption('area for ATC adjacent to crane 1 pedestal')).toBe(
      'Area for ATC Adjacent to Crane 1 Pedestal'
    );
    expect(properCaseCaption('external view of inclined auger B')).toBe('External View of Inclined Auger B');
  });

  it('preserves camelCase-style tags via the internal-capital signal', () => {
    expect(properCaseCaption('view from above, where EnviroUnit will be located')).toBe(
      'View from Above, Where EnviroUnit Will be Located'
    );
    expect(properCaseCaption('pull cord E.Stops for dryer discharge and inclined augers')).toBe(
      'Pull Cord E.Stops for Dryer Discharge and Inclined Augers'
    );
  });

  it('capitalizes both sides of a hyphenated compound, not just the first', () => {
    expect(properCaseCaption('showing the coiled-up cable at portside')).toBe(
      'Showing the Coiled-Up Cable at Portside'
    );
  });

  it('lowercases all forms of "to be" and standalone "up"/"down", but not inside a hyphenated compound', () => {
    expect(
      properCaseCaption(
        'this is a test for proper case it is not a big problem but it might be just a few up down and exd SLB cheese bites'
      )
    ).toBe(
      'This is a Test for Proper Case It is Not a Big Problem but It Might be Just a Few up down and Exd SLB Cheese Bites'
    );
    // still capitalized inside a hyphenated compound, per the real report example
    expect(properCaseCaption('showing the coiled-up cable')).toBe('Showing the Coiled-Up Cable');
  });

  it('normalizes whitelisted words to their canonical casing even typed in lowercase, punctuation and all', () => {
    expect(properCaseCaption('mud process room (aft) exd distribution box & starter panels')).toBe(
      'Mud Process Room (AFT) Exd Distribution Box & Starter Panels'
    );
    expect(properCaseCaption('casing tong jb - 250A supply from drilling switchboard')).toBe(
      'Casing Tong JB - 250A Supply from Drilling Switchboard'
    );
  });

  it('accepts extra whitelist entries and matches case-insensitively', () => {
    expect(properCaseCaption('riser splashzone corrosion', ['SplashZone'])).toBe('Riser SplashZone Corrosion');
  });

  it('always capitalizes the first word even if it would otherwise be a small word', () => {
    expect(properCaseCaption('to the portside junction box')).toBe('To the Portside Junction Box');
  });

  it('matches every line from a real Table of Figures, typed with natural label casing', () => {
    const lines = [
      ['load schedule WCE-ES-158-C12-0001-01-00D', 'Load Schedule WCE-ES-158-C12-0001-01-00D'],
      ['location for vacuum unit', 'Location for Vacuum Unit'],
      ['breaker and extract from rig drawing 7121-EBSAE-08', 'Breaker and Extract from Rig Drawing 7121-EBSAE-08'],
      [
        'upper deck - cable penetration to exd distribution in mud process room',
        'Upper Deck - Cable Penetration to Exd Distribution in Mud Process Room',
      ],
      ['1000A distribution board - upper deck aft', '1000A Distribution Board - Upper Deck AFT'],
      [
        'table showing motor ratings of existing and proposed auger drive',
        'Table Showing Motor Ratings of Existing and Proposed Auger Drive',
      ],
      ['existing shaker auger no.1 drive', 'Existing Shaker Auger no.1 Drive'],
      ['auger 1,2 & 3 control stations', 'Auger 1,2 & 3 Control Stations'],
      [
        'existing auger 3 - shaker solids discharge auger (AFT)',
        'Existing Auger 3 - Shaker Solids Discharge Auger (AFT)',
      ],
      ['control station for skip auger & inclined auger', 'Control Station for Skip Auger & Inclined Auger'],
      ['supply cable to auger starter panel from portside jb', 'Supply Cable to Auger Starter Panel from Portside JB'],
    ];
    for (const [input, expected] of lines) {
      expect(properCaseCaption(input)).toBe(expected);
    }
  });
});
