import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AssetRepository } from '../../core/persistence/asset.repository';
import { SessionRepository, type SessionSummary } from '../../core/persistence/session.repository';
import { SessionsPage } from './sessions-page';

/** Dépôt en mémoire : IndexedDB n'existe pas dans jsdom. */
class FakeSessionRepository {
  sessions: SessionSummary[] = [
    { id: 'taverne', name: 'La taverne', updatedAt: 0, mapCount: 2, playerCount: 4 },
    { id: 'crypte', name: 'La crypte', updatedAt: 0, mapCount: 1, playerCount: 1 },
  ];

  readonly list = vi.fn(async () => [...this.sessions]);
  readonly create = vi.fn(async (name: string) => {
    this.sessions.unshift({ id: 'nouvelle', name, updatedAt: 0, mapCount: 0, playerCount: 0 });
    return 'nouvelle';
  });
  readonly rename = vi.fn(async (id: string, name: string) => {
    this.sessions = this.sessions.map((s) => (s.id === id ? { ...s, name } : s));
  });
  readonly delete = vi.fn(async (id: string) => {
    this.sessions = this.sessions.filter((s) => s.id !== id);
  });
  readonly usedAssetIds = vi.fn(async () => ['image-1']);
}

type Fixture = ComponentFixture<SessionsPage>;

describe('SessionsPage', () => {
  let repository: FakeSessionRepository;
  let deleteUnused: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repository = new FakeSessionRepository();
    deleteUnused = vi.fn(async () => 0);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionRepository, useValue: repository },
        { provide: AssetRepository, useValue: { deleteUnused } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(): Promise<Fixture> {
    const fixture = TestBed.createComponent(SessionsPage);
    await until(fixture, () => expect(rows(fixture).length).toBeGreaterThan(0));
    return fixture;
  }

  async function until(fixture: Fixture, check: () => void): Promise<void> {
    await vi.waitFor(async () => {
      await fixture.whenStable();
      check();
    });
  }

  function rows(fixture: Fixture): HTMLLIElement[] {
    return [...fixture.nativeElement.querySelectorAll('li')];
  }

  function button(root: ParentNode, label: string): HTMLButtonElement {
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    return buttons.find((b) => b.textContent?.trim() === label || b.ariaLabel === label)!;
  }

  /** Saisit un nom dans le formulaire affiché et l'envoie. */
  function submitName(form: HTMLFormElement, name: string): void {
    form.querySelector('input')!.value = name;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('liste les sessions avec un lien vers leur vue MJ', async () => {
    const fixture = await render();

    expect(rows(fixture).map((row) => row.querySelector('a')!.getAttribute('href'))).toEqual([
      '/dm/taverne',
      '/dm/crypte',
    ]);
    expect(rows(fixture)[0].textContent).toContain('La taverne');
    expect(rows(fixture)[0].textContent).toContain('2 cartes · 4 joueurs');
    expect(rows(fixture)[1].textContent).toContain('1 carte · 1 joueur');
  });

  it('crée une session avec le nom saisi', async () => {
    const fixture = await render();

    button(fixture.nativeElement, '+ Nouvelle session').click();
    await fixture.whenStable();
    submitName(fixture.nativeElement.querySelector('form'), '  Les mines  ');

    await until(fixture, () => expect(rows(fixture)).toHaveLength(3));
    expect(repository.create).toHaveBeenCalledWith('Les mines');
    expect(rows(fixture)[0].textContent).toContain('Les mines');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it("n'enregistre pas un nom vide", async () => {
    const fixture = await render();

    button(fixture.nativeElement, '+ Nouvelle session').click();
    await fixture.whenStable();
    submitName(fixture.nativeElement.querySelector('form'), '   ');
    await fixture.whenStable();

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('renomme une session depuis sa ligne', async () => {
    const fixture = await render();

    button(rows(fixture)[1], 'Renommer La crypte').click();
    await fixture.whenStable();
    submitName(rows(fixture)[1].querySelector('form')!, 'La crypte oubliée');

    await until(fixture, () => expect(rows(fixture)[1].textContent).toContain('La crypte oubliée'));
    expect(repository.rename).toHaveBeenCalledWith('crypte', 'La crypte oubliée');
  });

  it('supprime une session après confirmation, puis nettoie les images inutilisées', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = await render();

    button(rows(fixture)[0], 'Supprimer La taverne').click();

    await until(fixture, () => expect(rows(fixture)).toHaveLength(1));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('« La taverne »'));
    expect(repository.delete).toHaveBeenCalledWith('taverne');
    await vi.waitFor(() => expect(deleteUnused).toHaveBeenCalledWith(['image-1']));
  });

  it('garde la session si le MJ annule la suppression', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = await render();

    button(rows(fixture)[0], 'Supprimer La taverne').click();
    await fixture.whenStable();

    expect(repository.delete).not.toHaveBeenCalled();
    expect(rows(fixture)).toHaveLength(2);
  });

  it('invite à créer une première session quand il n’y en a aucune', async () => {
    repository.sessions = [];
    const fixture = TestBed.createComponent(SessionsPage);

    await until(fixture, () =>
      expect(fixture.nativeElement.textContent).toContain("Aucune session pour l'instant"),
    );
  });
});
