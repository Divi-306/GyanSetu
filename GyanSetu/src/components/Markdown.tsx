import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Minimal markdown for lesson bodies: headings, paragraphs, bullet/numbered
 * lists, fenced code blocks, **bold**, *italic* and `inline code`.
 * Lessons are authored by us, so a small renderer beats a native dependency.
 */
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string };

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }
    const listItem = /^\s*([-*]|\d+\.)\s+(.*)$/;
    if (listItem.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && listItem.test(lines[i])) items.push(listItem.exec(lines[i++])![2]);
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

function Inline({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <Text key={i} style={styles.bold}>{p.slice(2, -2)}</Text>;
        if (p.startsWith('`') && p.endsWith('`')) return <Text key={i} style={styles.inlineCode}>{p.slice(1, -1)}</Text>;
        if (p.startsWith('*') && p.endsWith('*')) return <Text key={i} style={styles.italic}>{p.slice(1, -1)}</Text>;
        return p;
      })}
    </Text>
  );
}

export function Markdown({ source, skipFirstHeading = false }: { source: string; skipFirstHeading?: boolean }) {
  let blocks = parse(source);
  // The screen already shows the lesson title; don't repeat a leading "# Title".
  if (skipFirstHeading && blocks[0]?.kind === 'heading' && blocks[0].level === 1) blocks = blocks.slice(1);

  return (
    <View>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <Inline key={i} text={b.text} style={b.level <= 2 ? styles.h2 : styles.h3} />;
          case 'paragraph':
            return <Inline key={i} text={b.text} style={styles.paragraph} />;
          case 'list':
            return (
              <View key={i} style={styles.list}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.listItem}>
                    <Text style={styles.bullet}>{b.ordered ? `${j + 1}.` : '•'}</Text>
                    <Inline text={item} style={styles.listText} />
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <ScrollView key={i} horizontal style={styles.codeBlock} showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText}>{b.text}</Text>
              </ScrollView>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 17, fontWeight: '800', color: '#29392C', marginTop: 10, marginBottom: 8 },
  h3: { fontSize: 15, fontWeight: '700', color: '#29392C', marginTop: 8, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 22, color: '#4A564C', marginBottom: 12 },
  bold: { fontWeight: '700', color: '#29392C' },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: 'monospace', backgroundColor: '#F0EEE7', color: '#315C43' },
  list: { marginBottom: 12 },
  listItem: { flexDirection: 'row', marginBottom: 6 },
  bullet: { width: 22, fontSize: 14, lineHeight: 22, color: '#4F7757', fontWeight: '700' },
  listText: { flex: 1, fontSize: 14, lineHeight: 22, color: '#4A564C' },
  codeBlock: { backgroundColor: '#1F2A23', borderRadius: 10, padding: 12, marginBottom: 12 },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: '#E6F0E8' },
});
