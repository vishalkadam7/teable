import { FieldType } from '@teable/core';
import { Spin } from '@teable/ui-lib';
import { useContext } from 'react';
import { useTranslation } from '../../../../context/app/i18n';
import { SelectTag } from '../../../cell-value';
import { FilterContext } from '../../context';
import type { IFilterLinkProps } from './types';

export const DefaultTrigger = (props: IFilterLinkProps) => {
  const { value, field } = props;
  const { t } = useTranslation();
  const tableId = field.options.foreignTableId;

  const { context } = useContext(FilterContext);
  const linkContext = context?.[FieldType.Link];

  const values = typeof value === 'string' ? [value] : value;
  const recordMap = linkContext?.data?.find((item) => item.tableId === tableId)?.data;
  return linkContext?.isLoading ? (
    <Spin className="size-4" />
  ) : value ? (
    values?.map((id) => (
      <SelectTag
        className="flex items-center"
        key={id}
        label={recordMap?.[id] || t('common.unnamedRecord')}
      />
    ))
  ) : (
    t('common.selectPlaceHolder')
  );
};
