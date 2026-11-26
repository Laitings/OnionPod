package app.onionpod;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class NewEpisodeJob extends JobService {
    private Thread worker;

    @Override public boolean onStartJob(JobParameters parameters) {
        worker = new Thread(() -> {
            try { NewEpisodes.check(this); }
            catch (Exception error) { android.util.Log.w("OnionPod", "Could not check for new episodes.", error); }
            jobFinished(parameters, false);
        });
        worker.start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        if (worker != null) worker.interrupt();
        return false;
    }
}
