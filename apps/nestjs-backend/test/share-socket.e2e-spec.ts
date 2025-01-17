/* eslint-disable @typescript-eslint/no-explicit-any */
import type { INestApplication } from '@nestjs/common';
import { HttpErrorCode, IdPrefix, RecordOpBuilder, ViewType } from '@teable/core';
import { enableShareView as apiEnableShareView } from '@teable/openapi';
import { map } from 'lodash';
import { logger, type Doc } from 'sharedb/lib/client';
import { vi } from 'vitest';
import { ShareDbService } from '../src/share-db/share-db.service';
import { initApp, updateViewColumnMeta, createTable, deleteTable } from './utils/init-app';

describe('Share (socket-e2e) (e2e)', () => {
  let app: INestApplication;
  let tableId: string;
  let shareId: string;
  let viewId: string;
  const baseId = globalThis.testConfig.baseId;
  let fieldIds: string[] = [];
  let shareDbService!: ShareDbService;

  beforeAll(async () => {
    const appCtx = await initApp();
    app = appCtx.app;
    shareDbService = app.get(ShareDbService);

    const table = await createTable(baseId, {
      name: 'table1',
      views: [
        {
          type: ViewType.Grid,
          name: 'view1',
        },
        {
          type: ViewType.Form,
          name: 'view2',
        },
      ],
    });
    tableId = table.id;
    viewId = table.defaultViewId!;
    const shareResult = await apiEnableShareView({ tableId, viewId });
    fieldIds = map(table.fields, 'id');
    // hidden last one field
    const field = table.fields[fieldIds.length - 1];
    await updateViewColumnMeta(tableId, viewId, [
      { fieldId: field.id, columnMeta: { hidden: true } },
    ]);
    shareId = shareResult.data.shareId;
  });

  afterAll(async () => {
    await deleteTable(baseId, tableId);

    await app.close();
  });

  const getQuery = (collection: string, shareId: string) => {
    return new Promise<Doc<any>[]>((resolve, reject) => {
      const connection = shareDbService.connect(undefined, {
        url: `ws://localhost:3000/socket?shareId=${shareId}`,
        headers: {},
      });
      connection.createFetchQuery(collection, {}, {}, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      connection.on('error', (err) => reject(err));
      connection.agent?.stream.on('error', (err) => reject(err));
      shareDbService.on('error', (err) => reject(err));
      setTimeout(() => {
        reject(new Error('connection error'));
      }, 2000);
    });
  };

  it('Retrieve fields other than those that are hidden', async () => {
    const collection = `${IdPrefix.Field}_${tableId}`;
    const fields = await getQuery(collection, shareId);
    expect(fields.length).toEqual(fieldIds.length - 1);
  });

  it('Reading the view query will only get the one that was shared', async () => {
    const collection = `${IdPrefix.View}_${tableId}`;
    const views = await getQuery(collection, shareId);

    expect(views.length).toEqual(1);
    expect(views[0].id).toEqual(viewId);
  });

  it('shareId error', async () => {
    const collection = `${IdPrefix.View}_${tableId}`;
    const consoleWarnSpy = vi.spyOn(logger, 'warn');
    await expect(getQuery(collection, 'share')).rejects.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Agent closed due to error',
      expect.anything(),
      expect.objectContaining({
        message: 'Unauthorized',
        code: 'unauthorized_share',
      })
    );
  });

  it('cant not update record in share page', async () => {
    const collection = `${IdPrefix.Record}_${tableId}`;
    const docs = await getQuery(collection, shareId);
    const operation = RecordOpBuilder.editor.setRecord.build({
      fieldId: fieldIds[0],
      newCellValue: '1',
      oldCellValue: docs[0].data.fields[fieldIds[0]],
    });
    const error = await new Promise((resolve) => {
      docs[0].submitOp(operation, undefined, (error) => {
        resolve(error);
      });
    });
    expect(error).toEqual(
      expect.objectContaining({
        code: HttpErrorCode.RESTRICTED_RESOURCE,
      })
    );
  });
});
