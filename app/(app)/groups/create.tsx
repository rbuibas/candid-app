import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { createGroup, type CreateGroupInput } from '@/api/groups';
import { setActiveGroup } from '@/stores/activeGroup';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const INT_RE = /^\d+$/;

const DEFAULTS = {
  prompts_per_day: '4',
  daily_window_start: '10:00',
  daily_window_end: '01:00',
  min_prompt_gap_minutes: '45',
  response_window_seconds: '300',
  late_window_seconds: '1800',
  max_video_length_seconds: '10',
  view_delay_seconds: '0',
};

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function toDateString(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dt: Date, days: number): Date {
  const next = new Date(dt);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(s: string): Date {
  if (isValidDate(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

function formatDisplay(s: string): string {
  if (!isValidDate(s)) return s;
  return parseDate(s).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CreateGroup() {
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => toDateString(new Date()));
  const [endDate, setEndDate] = useState(() => toDateString(addDays(new Date(), 1)));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState(DEFAULTS);
  const [openPicker, setOpenPicker] = useState<null | 'start' | 'end'>(null);

  const onPickDate = (which: 'start' | 'end') => (event: DateTimePickerEvent, selected?: Date) => {
    // Android renders a one-shot dialog; close it on any result. iOS keeps the
    // inline picker open until the user taps the field again.
    if (Platform.OS === 'android') setOpenPicker(null);
    if (event.type === 'dismissed' || !selected) return;
    const value = toDateString(selected);
    if (which === 'start') setStartDate(value);
    else setEndDate(value);
  };

  const trimmedName = name.trim();
  const dateError = useMemo(() => {
    if (startDate && !isValidDate(startDate)) return 'Start date must be YYYY-MM-DD.';
    if (endDate && !isValidDate(endDate)) return 'End date must be YYYY-MM-DD.';
    if (isValidDate(startDate) && isValidDate(endDate) && endDate < startDate) {
      return 'End date must be on or after start date.';
    }
    return null;
  }, [startDate, endDate]);

  const advancedError = useMemo(() => {
    const intFields: (keyof typeof DEFAULTS)[] = [
      'prompts_per_day',
      'min_prompt_gap_minutes',
      'response_window_seconds',
      'late_window_seconds',
      'max_video_length_seconds',
      'view_delay_seconds',
    ];
    for (const k of intFields) {
      if (!INT_RE.test(advanced[k])) return `${k} must be a whole number.`;
    }
    if (!TIME_RE.test(advanced.daily_window_start)) return 'daily_window_start must be HH:MM.';
    if (!TIME_RE.test(advanced.daily_window_end)) return 'daily_window_end must be HH:MM.';
    return null;
  }, [advanced]);

  const canSubmit =
    trimmedName.length > 0 &&
    isValidDate(startDate) &&
    isValidDate(endDate) &&
    dateError === null &&
    advancedError === null;

  const mutation = useMutation({
    mutationFn: (body: CreateGroupInput) => createGroup(body),
    onSuccess: ({ group, invite_code }) => {
      qc.setQueryData(['groups', group.id, 'invite'], { code: invite_code });
      qc.setQueryData(['groups', group.id], group);
      qc.invalidateQueries({ queryKey: ['groups'] });
      // The new group becomes the active group; land on the Feed tab (which
      // bounces to the photo booth on first entry).
      setActiveGroup(group.id);
      router.replace('/(app)/(tabs)/feed');
    },
  });

  const onSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({
      name: trimmedName,
      start_date: startDate,
      end_date: endDate,
      settings: {
        prompts_per_day: Number(advanced.prompts_per_day),
        daily_window_start: advanced.daily_window_start,
        daily_window_end: advanced.daily_window_end,
        min_prompt_gap_minutes: Number(advanced.min_prompt_gap_minutes),
        response_window_seconds: Number(advanced.response_window_seconds),
        late_window_seconds: Number(advanced.late_window_seconds),
        max_video_length_seconds: Number(advanced.max_video_length_seconds),
        view_delay_seconds: Number(advanced.view_delay_seconds),
      },
    });
  };

  const setAdv = (k: keyof typeof DEFAULTS) => (v: string) =>
    setAdvanced((prev) => ({ ...prev, [k]: v }));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Create group' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Group name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Bachelor party 2026"
              style={styles.input}
              autoCapitalize="words"
              maxLength={100}
            />
          </Field>

          <Field label="Start date">
            <Pressable
              onPress={() => setOpenPicker((p) => (p === 'start' ? null : 'start'))}
              style={({ pressed }) => [styles.input, pressed && styles.pressed]}
            >
              <Text style={styles.dateText}>{formatDisplay(startDate)}</Text>
            </Pressable>
            {openPicker === 'start' ? (
              <DateTimePicker
                value={parseDate(startDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onPickDate('start')}
              />
            ) : null}
          </Field>

          <Field label="End date">
            <Pressable
              onPress={() => setOpenPicker((p) => (p === 'end' ? null : 'end'))}
              style={({ pressed }) => [styles.input, pressed && styles.pressed]}
            >
              <Text style={styles.dateText}>{formatDisplay(endDate)}</Text>
            </Pressable>
            {openPicker === 'end' ? (
              <DateTimePicker
                value={parseDate(endDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={parseDate(startDate)}
                onChange={onPickDate('end')}
              />
            ) : null}
          </Field>

          {dateError ? <Text style={styles.error}>{dateError}</Text> : null}

          <Pressable
            onPress={() => setAdvancedOpen((v) => !v)}
            style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
          >
            <Text style={styles.advancedToggleText}>
              {advancedOpen ? '▾ Hide advanced settings' : '▸ Show advanced settings'}
            </Text>
          </Pressable>

          {advancedOpen ? (
            <View style={styles.advanced}>
              <NumField
                label="Prompts per day"
                value={advanced.prompts_per_day}
                onChange={setAdv('prompts_per_day')}
              />
              <Field label="Daily window start (HH:MM, local)">
                <TextInput
                  value={advanced.daily_window_start}
                  onChangeText={setAdv('daily_window_start')}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={5}
                />
              </Field>
              <Field label="Daily window end (HH:MM, local — may wrap past midnight)">
                <TextInput
                  value={advanced.daily_window_end}
                  onChangeText={setAdv('daily_window_end')}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={5}
                />
              </Field>
              <NumField
                label="Min prompt gap (minutes)"
                value={advanced.min_prompt_gap_minutes}
                onChange={setAdv('min_prompt_gap_minutes')}
              />
              <NumField
                label="Response window (seconds)"
                value={advanced.response_window_seconds}
                onChange={setAdv('response_window_seconds')}
              />
              <NumField
                label="Late grace window (seconds)"
                value={advanced.late_window_seconds}
                onChange={setAdv('late_window_seconds')}
              />
              <NumField
                label="Max video length (seconds)"
                value={advanced.max_video_length_seconds}
                onChange={setAdv('max_video_length_seconds')}
              />
              <NumField
                label="Feed view delay (seconds)"
                value={advanced.view_delay_seconds}
                onChange={setAdv('view_delay_seconds')}
              />
              {advancedError ? <Text style={styles.error}>{advancedError}</Text> : null}
            </View>
          ) : null}

          {mutation.isError ? (
            <Text style={styles.error}>{queryErrorText(mutation.error)}</Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || mutation.isPending}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit || mutation.isPending) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create group</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#656d76' },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2328',
    backgroundColor: '#fff',
  },
  dateText: { fontSize: 16, color: '#1f2328' },
  error: { color: '#cf222e', fontSize: 14 },
  advancedToggle: { paddingVertical: 8 },
  advancedToggleText: { color: '#1f6feb', fontWeight: '600', fontSize: 15 },
  advanced: { gap: 16 },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d7de',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
