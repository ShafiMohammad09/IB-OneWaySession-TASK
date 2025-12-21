import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SystemChecks } from './system-checks';

describe('SystemChecks', () => {
  let component: SystemChecks;
  let fixture: ComponentFixture<SystemChecks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemChecks]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SystemChecks);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
