import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { ProjectDocument } from './entities/project-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectDocument])],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService, TypeOrmModule],
})
export class ProjectsModule {}
