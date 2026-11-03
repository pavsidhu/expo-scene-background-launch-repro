import { useCallback, useEffect, useState } from 'react';
import { AppState, Button, FlatList, StyleSheet, Text, View } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { File, Paths } from 'expo-file-system';

const TASK_NAME = 'record-run';
const log = new File(Paths.document, 'log.txt');

async function record(kind) {
  const line = `${new Date().toISOString()} ${kind} (AppState: ${AppState.currentState})\n`;
  console.log('[repro]', line.trim());
  if (!log.exists) log.create();
  await log.write(line, { append: true });
}

// Recorded every time the JS bundle runs, so a background launch that starts JS shows up too.
record('js-started');

// Defined at module scope, as the expo-task-manager docs require.
TaskManager.defineTask(TASK_NAME, async () => {
  await record('task-ran');
  return BackgroundTask.BackgroundTaskResult.Success;
});

export default function App() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('…');

  const refresh = useCallback(() => {
    setEntries(log.exists ? log.textSync().trim().split('\n').reverse() : []);
  }, []);

  useEffect(() => {
    (async () => {
      const s = await BackgroundTask.getStatusAsync();
      setStatus(BackgroundTask.BackgroundTaskStatus[s]);
      if (!(await TaskManager.isTaskRegisteredAsync(TASK_NAME))) {
        await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
      }
      refresh();
    })().catch((e) => setStatus(String(e)));
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Background task: {TASK_NAME}</Text>
      <Text>BackgroundTask status: {status}</Text>
      <View style={styles.buttons}>
        <Button title="Refresh" onPress={refresh} />
        {__DEV__ && (
          <Button
            title="Trigger task (debug builds only)"
            onPress={() => BackgroundTask.triggerTaskWorkerForTestingAsync()}
          />
        )}
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item, i) => `${i}`}
        renderItem={({ item }) => <Text style={styles.entry}>{item}</Text>}
        ListEmptyComponent={<Text>No entries yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 80, paddingHorizontal: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 12 },
  entry: { fontFamily: 'Menlo', fontSize: 12, paddingVertical: 4 },
});
