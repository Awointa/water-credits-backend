import { Test, TestingModule } from '@nestjs/testing';
import { OracleController } from './oracle.controller';

describe('OracleController', () => {
  let controller: OracleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OracleController],
    }).compile();

    controller = module.get<OracleController>(OracleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
