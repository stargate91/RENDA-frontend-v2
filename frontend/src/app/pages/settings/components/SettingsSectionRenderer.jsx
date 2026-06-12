import { Fragment } from 'react';
import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import SettingsTextField from './fields/SettingsTextField.jsx';
import SettingsSwitchField from './fields/SettingsSwitchField.jsx';
import SettingsSelectField from './fields/SettingsSelectField.jsx';

function renderItem(item, context) {
  if (item.visible && !item.visible(context)) {
    return null;
  }

  if (item.type === 'text') {
    return (
      <SettingsTextField
        key={item.key || item.field}
        field={item.field}
        label={item.label}
        hint={item.hint}
        placeholder={item.placeholder}
        type={item.inputType}
        min={item.min}
        className={item.className}
        inputRef={item.inputRef}
      />
    );
  }

  if (item.type === 'select') {
    return (
      <SettingsSelectField
        key={item.key || item.field}
        field={item.field}
        label={item.label}
        hint={item.hint}
        options={item.options}
        className={item.className}
      />
    );
  }

  if (item.type === 'switch') {
    return (
      <Fragment key={item.key || item.field}>
        <SettingsSwitchField
          field={item.field}
          id={item.id || item.field}
          className={item.className}
        >
          {item.children}
        </SettingsSwitchField>
        {item.hint ? (
          <span className={item.hintClassName || 'ui-field__hint'}>
            {item.hint}
          </span>
        ) : null}
      </Fragment>
    );
  }

  if (item.type === 'custom') {
    return (
      <Fragment key={item.key}>
        {item.render(context)}
      </Fragment>
    );
  }

  return null;
}

export default function SettingsSectionRenderer({ section, context = {} }) {
  if (section.className === 'settings-section-cardless') {
    return (
      <Stack gap={section.gap}>
        {section.items.map((item) => renderItem(item, context))}
      </Stack>
    );
  }

  return (
    <Card title={section.title} eyebrow={section.eyebrow} className={section.className}>
      <Stack gap={section.gap}>
        {section.items.map((item) => renderItem(item, context))}
      </Stack>
    </Card>
  );
}
