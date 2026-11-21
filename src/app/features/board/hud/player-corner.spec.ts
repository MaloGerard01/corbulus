import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { HudTheme, Player } from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { PlayerCorner } from './player-corner';

const BORIN: Player = {
  id: 'p1',
  name: 'Borin',
  color: '#3b82f6',
  seat: 'bottom',
  seatPosition: null,
  portraitAssetId: null,
  hp: 2,
  hpMax: 10,
  gold: 37,
};

describe('PlayerCorner', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AssetRepository, useValue: { getPreview: async () => null } }],
    });
  });

  async function render(player: Player, theme?: HudTheme): Promise<ComponentFixture<PlayerCorner>> {
    const fixture = TestBed.createComponent(PlayerCorner);
    fixture.componentRef.setInput('player', player);
    if (theme) fixture.componentRef.setInput('theme', theme);
    await fixture.whenStable();
    return fixture;
  }

  function text(fixture: ComponentFixture<PlayerCorner>): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ');
  }

  it('garde le style sobre par défaut', async () => {
    const fixture = await render(BORIN);
    expect(fixture.nativeElement.querySelector('app-classic-card')).not.toBeNull();
    expect(text(fixture)).toContain('PV 2 / 10');
    expect(text(fixture)).toContain('PO 37');
  });

  it('style médiéval-fantastique : PV et pièces d’or', async () => {
    const fixture = await render(BORIN, 'fantasy');
    expect(fixture.nativeElement.querySelector('app-fantasy-card')).not.toBeNull();
    expect(text(fixture)).toContain('2 / 10');
    expect(text(fixture)).toContain('PO');
  });

  it('style science-fiction : état, jauge segmentée et crédits', async () => {
    const fixture = await render(BORIN, 'scifi');
    const card: HTMLElement = fixture.nativeElement.querySelector('app-scifi-card');

    expect(card.querySelector('[data-status]')?.textContent?.trim()).toBe('Critique');
    expect(text(fixture)).toContain('02/10');
    expect(text(fixture)).toContain('CR');
    expect(text(fixture)).toContain('0037');
    // 2 PV sur 10 : 2 segments allumés sur 10.
    const segments = [...card.querySelectorAll<HTMLElement>('span.-skew-x-20')];
    const lit = segments.filter((s) => s.style.backgroundColor === 'rgb(244, 63, 94)');
    expect(segments).toHaveLength(10);
    expect(lit).toHaveLength(2);
  });

  it('estompe la carte d’un joueur hors combat, dans tous les styles', async () => {
    for (const theme of ['classic', 'fantasy', 'scifi'] as const) {
      const fixture = await render({ ...BORIN, hp: 0 }, theme);
      expect(fixture.nativeElement.classList).toContain('opacity-50');
    }
  });

  it('montre le nom à l’envers, pour les joueurs d’en face, dans tous les styles', async () => {
    for (const theme of ['classic', 'fantasy', 'scifi'] as const) {
      const fixture = await render(BORIN, theme);
      const facing: HTMLElement = fixture.nativeElement.querySelector('[data-facing-others]');
      expect(facing.classList).toContain('rotate-180');
      expect(facing.textContent).toContain('Borin');
    }
  });
});
