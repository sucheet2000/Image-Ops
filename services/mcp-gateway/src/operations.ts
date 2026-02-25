import type { OperationDef } from './types';

export const OPERATIONS: OperationDef[] = [
  {
    operationId: 'uploads_init',
    method: 'POST',
    route: '/api/uploads/init',
    summary: 'Initialize temporary upload target',
    keyInputFields: ['filename', 'mime', 'size', 'tool'],
    scope: 'image.upload',
    mutating: true,
  },
  {
    operationId: 'jobs_create',
    method: 'POST',
    route: '/api/jobs',
    summary: 'Create processing job',
    keyInputFields: ['tool', 'inputObjectKey', 'options'],
    scope: 'image.jobs.write',
    mutating: true,
  },
  {
    operationId: 'jobs_get',
    method: 'GET',
    route: '/api/jobs/{id}',
    summary: 'Get processing job status',
    keyInputFields: ['id'],
    scope: 'image.jobs.read',
    mutating: false,
  },
  {
    operationId: 'cleanup_create',
    method: 'POST',
    route: '/api/cleanup',
    summary: 'Trigger temporary object cleanup',
    keyInputFields: ['objectKeys'],
    scope: 'image.cleanup',
    mutating: true,
  },
  {
    operationId: 'quota_get',
    method: 'GET',
    route: '/api/quota',
    summary: 'Get quota status for subject',
    keyInputFields: ['subjectId'],
    scope: 'image.quota.read',
    mutating: false,
  },
];

export const OPERATION_BY_ID = new Map(
  OPERATIONS.map((operation) => [operation.operationId, operation])
);
