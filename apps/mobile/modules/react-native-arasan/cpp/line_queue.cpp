#include "line_queue.h"

namespace reactnativearasan
{
  void LineQueue::push(std::string line)
  {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (closed_)
        return;
      lines_.push_back(std::move(line));
    }
    ready_.notify_one();
  }

  bool LineQueue::pop(std::string &out)
  {
    std::unique_lock<std::mutex> lock(mutex_);
    ready_.wait(lock, [this] { return !lines_.empty() || closed_; });
    // Drain before reporting end-of-stream.
    if (lines_.empty())
      return false;
    out = std::move(lines_.front());
    lines_.pop_front();
    return true;
  }

  void LineQueue::close()
  {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      closed_ = true;
    }
    // notify_all, not notify_one: every blocked reader has to learn the stream
    // ended, or a second consumer waits forever.
    ready_.notify_all();
  }

  bool LineQueue::closed() const
  {
    std::lock_guard<std::mutex> lock(mutex_);
    return closed_;
  }
}
