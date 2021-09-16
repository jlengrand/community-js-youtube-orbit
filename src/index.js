const pkg = require('../package.json')
const OrbitActivities = require('@orbit-love/activities')
const axios = require('axios')
const qs = require('querystring')

class OrbitYouTube {
  constructor(orbitWorkspaceId, orbitApiKey, ytApiKey, ytChannelId) {
    this.credentials = this.setCredentials(orbitWorkspaceId, orbitApiKey, ytApiKey, ytChannelId)
    this.orbit = new OrbitActivities(
      this.credentials.orbitWorkspaceId,
      this.credentials.orbitApiKey,
      `community-js-youtube-orbit/${pkg.version}`
    )
  }

  setCredentials(orbitWorkspaceId, orbitApiKey, ytApiKey) {
    if (!(orbitWorkspaceId || process.env.ORBIT_WORKSPACE_ID))
      throw 'You must provide an Orbit Workspace ID or set an ORBIT_WORKSPACE_ID environment variable'
    if (!(orbitApiKey || process.env.ORBIT_API_KEY))
      throw 'You must provide an Orbit API Key or set an ORBIT_API_KEY environment variable'
    if (!(ytApiKey || process.env.YOUTUBE_API_KEY))
      throw 'You must provide a YouTube API Key or set a YOUTUBE_API_KEY environment variable'
    return {
      orbitWorkspaceId: orbitWorkspaceId || process.env.ORBIT_WORKSPACE_ID,
      orbitApiKey: orbitApiKey || process.env.ORBIT_API_KEY,
      ytApiKey: ytApiKey || process.env.YOUTUBE_API_KEY
    }
  }

  async api(path, query = {}) {
    try {
      if (!path) throw 'You must provide a path'
      const BASE_URL = 'https://www.googleapis.com/youtube/v3'
      const options = { key: this.credentials.ytApiKey, ...query }
      const url = BASE_URL + path + '?' + qs.encode(options)
      const { data } = await axios.get(url)
      return data
    } catch (error) {
      if (error.response) {
        throw new Error(`${error.response.status}: ${JSON.stringify(error.response.data)}`)
      } else {
        throw new Error(error)
      }
    }
  }

  async getChannelUploadPlaylistId(channelId) {
    try {
      if (!channelId) throw 'You must provide a channelId'
      const channelsList = await this.api('/channels', { part: 'contentDetails', id: channelId })
      if (!channelsList.items) throw new Error('404: no channel with that id')
      const uploadsPlaylist = channelsList.items[0].contentDetails.relatedPlaylists.uploads
      return uploadsPlaylist
    } catch (error) {
      throw new Error(error)
    }
  }

  async getVideoPage(playlistId, pageToken) {
    try {
      if (!playlistId) throw 'You must provide a playlistId'
      const query = { part: 'snippet,contentDetails', maxResults: 50, playlistId }
      if (pageToken) query.pageToken = pageToken
      const videos = await this.api('/playlistItems', query)
      return videos
    } catch (error) {
      throw new Error(error)
    }
  }

  async getVideos(playlistId) {
    try {
      let videos = []
      let nextPageToken

      const initialPage = await this.getVideoPage(playlistId)
      videos = initialPage.items
      nextPageToken = initialPage.nextPageToken

      while (nextPageToken) {
        const page = await this.getVideoPage(playlistId, nextPageToken)
        videos = [...videos, ...page.items]
        nextPageToken = page.nextPageToken
      }

      return videos
    } catch (error) {
      throw new Error(error)
    }
  }

  async getCommentPage(videoId, pageToken) {
    try {
      if (!videoId) throw 'You must provide a videoId'
      const query = { part: 'snippet,replies', maxResults: 50, videoId }
      if (pageToken) query.pageToken = pageToken

      const comments = await this.api('/commentThreads', query).catch(error => {
        const e = String(error)
        const commentThreadsNotFound = e.includes('not found')
        const disabledComments = e.includes('disabled')
        if (commentThreadsNotFound || disabledComments) {
          return { items: [], nextPageToken: false }
        } else {
          throw e
        }
      })

      let replies = []
      for (let item of comments.items) {
        if (item.snippet.totalReplyCount) {
          replies = item.replies.comments
        }
      }

      return {
        items: [...comments.items, ...replies],
        nextPageToken: comments.nextPageToken
      }
    } catch (error) {
      throw new Error(error)
    }
  }

  async getComments(videoId) {
    try {
      let comments = []
      let nextPageToken

      const initialPage = await this.getCommentPage(videoId)
      comments = initialPage.items
      nextPageToken = initialPage.nextPageToken

      while (nextPageToken) {
        const page = await this.getCommentPage(videoId, nextPageToken)
        comments = [...comments, ...page.items]
        nextPageToken = page.nextPageToken
      }

      return comments
    } catch (error) {
      throw new Error(error)
    }
  }

  ///

  prepareComments(list) {
    return new Promise(async (resolve, reject) => {
      try {
        const prepared = comments.prepare(list)
        resolve(prepared)
      } catch (error) {
        reject(error)
      }
    })
  }

  addActivities(activities) {
    return new Promise(async (resolve, reject) => {
      try {
        let stats = { added: 0, duplicates: 0, errors: [] }
        for (let activity of activities) {
          await this.orbit
            .createActivity(activity)
            .then(() => {
              stats.added++
            })
            .catch(err => {
              if (err.errors.key) stats.duplicates++
              else {
                errors.push(err)
              }
            })
        }
        resolve(stats)
      } catch (error) {
        reject(error)
      }
    })
  }
}

module.exports = OrbitYouTube
