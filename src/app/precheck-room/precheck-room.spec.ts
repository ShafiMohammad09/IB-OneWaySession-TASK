import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrecheckRoom } from './precheck-room';

describe('PrecheckRoom', () => {
  let component: PrecheckRoom;
  let fixture: ComponentFixture<PrecheckRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrecheckRoom]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrecheckRoom);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
