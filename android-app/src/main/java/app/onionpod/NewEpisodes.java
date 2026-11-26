package app.onionpod;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Xml;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

/** Periodically checks followed feeds and posts a notification for releases not seen before. */
final class NewEpisodes {
    private static final int JOB_ID = 4101;
    private static final long INTERVAL_MS = 4 * 60 * 60_000L;
    private static final String CHANNEL = "new-episodes";
    private static final int SEEN_LIMIT = 100;

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("new-episodes", Context.MODE_PRIVATE);
    }

    static boolean enabled(Context context) { return prefs(context).getBoolean("enabled", false); }

    static void setFollows(Context context, JSONArray follows) {
        prefs(context).edit().putString("follows", follows.toString()).apply();
    }

    static void setEnabled(Context context, boolean enabled) {
        SharedPreferences prefs = prefs(context);
        boolean changed = enabled != enabled(context);
        SharedPreferences.Editor edit = prefs.edit().putBoolean("enabled", enabled);
        // Turning notifications back on starts a new baseline instead of announcing the backlog.
        if (!enabled) {
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith("seen:") || key.startsWith("tag:") || key.startsWith("modified:")) edit.remove(key);
            }
        }
        edit.apply();
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (!enabled) {
            scheduler.cancel(JOB_ID);
            return;
        }
        if (!changed && scheduler.getPendingJob(JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, NewEpisodeJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(INTERVAL_MS).setPersisted(true).build());
    }

    static void check(Context context) throws JSONException {
        JSONArray follows = new JSONArray(prefs(context).getString("follows", "[]"));
        for (int i = 0; i < follows.length() && !Thread.currentThread().isInterrupted() && enabled(context); i++) {
            JSONObject follow = follows.getJSONObject(i);
            try { checkFeed(context, follow.getString("url"), follow.optString("title", "Podcast")); }
            catch (Exception error) { android.util.Log.w("OnionPod", "Could not check a followed feed.", error); }
        }
    }

    private static final class Release {
        final String id;
        final String title;
        final long date;
        Release(String id, String title, long date) {
            this.id = id;
            this.title = title;
            this.date = date;
        }
    }

    private static void checkFeed(Context context, String feed, String show) throws Exception {
        SharedPreferences prefs = prefs(context);
        URL url = secure(feed);
        for (int redirects = 0; redirects <= 4; redirects++) {
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setRequestProperty("User-Agent", "OnionPod/0.1");
                // Unchanged feeds answer 304 and cost almost no data.
                if (prefs.contains("seen:" + feed)) {
                    String tag = prefs.getString("tag:" + feed, null);
                    String modified = prefs.getString("modified:" + feed, null);
                    if (tag != null) connection.setRequestProperty("If-None-Match", tag);
                    if (modified != null) connection.setRequestProperty("If-Modified-Since", modified);
                }
                int status = connection.getResponseCode();
                if (status == 304) return;
                String location = connection.getHeaderField("Location");
                if (status >= 300 && status < 400 && location != null) {
                    url = secure(new URL(url, location).toString());
                    continue;
                }
                if (status != 200) return;
                List<Release> releases;
                try (InputStream input = limited(connection.getInputStream())) { releases = parse(input); }
                announce(context, feed, show, releases);
                prefs.edit().putString("tag:" + feed, connection.getHeaderField("ETag"))
                    .putString("modified:" + feed, connection.getHeaderField("Last-Modified")).apply();
                return;
            } finally { connection.disconnect(); }
        }
    }

    private static void announce(Context context, String feed, String show, List<Release> releases) throws JSONException {
        SharedPreferences prefs = prefs(context);
        String stored = prefs.getString("seen:" + feed, null);
        Set<String> seen = new HashSet<>();
        JSONArray previous = new JSONArray(stored == null ? "[]" : stored);
        for (int i = 0; i < previous.length(); i++) seen.add(previous.getString(i));
        Collections.sort(releases, (a, b) -> Long.compare(b.date, a.date));
        JSONArray next = new JSONArray();
        List<Release> added = new ArrayList<>();
        long recent = System.currentTimeMillis() - 7 * 24 * 60 * 60_000L;
        for (Release release : releases.subList(0, Math.min(SEEN_LIMIT, releases.size()))) {
            next.put(release.id);
            if (stored != null && !seen.contains(release.id) && (release.date == 0 || release.date > recent)) {
                added.add(release);
            }
        }
        prefs.edit().putString("seen:" + feed, next.toString()).apply();
        if (added.isEmpty()) return;
        notify(context, feed, show, added.size() == 1 ? added.get(0).title : added.size() + " new episodes");
    }

    private static void notify(Context context, String feed, String show, String text) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return;
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "New episodes",
                NotificationManager.IMPORTANCE_DEFAULT));
            builder = new Notification.Builder(context, CHANNEL);
        } else builder = new Notification.Builder(context);
        PendingIntent open = PendingIntent.getActivity(context, 0,
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        manager.notify(feed, 1, builder.setSmallIcon(R.drawable.ic_notification).setContentTitle(show)
            .setContentText(text).setContentIntent(open).setAutoCancel(true).build());
    }

    /** Reads episode identity, title, and release date from RSS or Atom entries that carry audio. */
    private static List<Release> parse(InputStream input) throws Exception {
        XmlPullParser parser = Xml.newPullParser();
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
        parser.setInput(input, null);
        List<Release> releases = new ArrayList<>();
        boolean inside = false;
        String id = "";
        String audio = "";
        String title = "";
        long date = 0;
        for (int event = parser.next(); event != XmlPullParser.END_DOCUMENT && releases.size() < 3000; event = parser.next()) {
            if (event == XmlPullParser.START_TAG) {
                String name = parser.getName();
                if (name.equals("item") || name.equals("entry")) {
                    inside = true;
                    id = "";
                    audio = "";
                    title = "";
                    date = 0;
                } else if (!inside) continue;
                else if (name.equals("enclosure")) audio = value(parser.getAttributeValue(null, "url"));
                else if (name.equals("link") && "enclosure".equals(parser.getAttributeValue(null, "rel"))) {
                    audio = value(parser.getAttributeValue(null, "href"));
                } else if (name.equals("guid") || name.equals("id")) id = parser.nextText().trim();
                else if (name.equals("title")) title = parser.nextText().trim();
                else if (name.equals("pubDate") || name.equals("published")) date = date(parser.nextText().trim());
            } else if (event == XmlPullParser.END_TAG
                    && (parser.getName().equals("item") || parser.getName().equals("entry"))) {
                inside = false;
                // Releases dated in the future wait until their time.
                if (!audio.isEmpty() && date <= System.currentTimeMillis()) {
                    releases.add(new Release(id.isEmpty() ? audio : id, title.isEmpty() ? "New episode" : title, date));
                }
            }
        }
        return releases;
    }

    private static String value(String text) { return text == null ? "" : text; }

    private static long date(String text) {
        for (String pattern : new String[] {"EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz",
                "dd MMM yyyy HH:mm:ss Z", "yyyy-MM-dd'T'HH:mm:ss"}) {
            try {
                Date parsed = new SimpleDateFormat(pattern, Locale.US).parse(text);
                if (parsed != null) return parsed.getTime();
            } catch (Exception ignored) { /* Try the next format. */ }
        }
        return 0;
    }

    private static URL secure(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) || url.getHost().isEmpty() || url.getUserInfo() != null
                || (url.getPort() != -1 && url.getPort() != 443)) {
            throw new IllegalArgumentException("Use a public HTTPS address.");
        }
        return url;
    }

    private static InputStream limited(InputStream source) {
        return new FilterInputStream(source) {
            private long total;
            @Override public int read(byte[] buffer, int offset, int length) throws IOException {
                int count = super.read(buffer, offset, length);
                total += Math.max(0, count);
                if (total > 20_000_000) throw new IOException("This feed is too large.");
                return count;
            }
        };
    }
}
