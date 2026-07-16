console.log("comments.js LOADED OK")

window.sendComment = async function(postId) {

  console.log("sendComment clicked:", postId)

  if (!currentWallet) {
    alert("Connect wallet dulu")
    return
  }

  const input = document.getElementById(`comment-${postId}`)
  const text = input.value.trim()

  if (!text) {
    alert("Komentar kosong")
    return
  }

  const { error } = await supabaseClient
    .from("comments")
    .insert([{
      post_id: postId,
      user_id: currentWallet,
      comment: text
    }])

  if (error) {
    console.log(error)
    alert("Gagal kirim komentar")
    return
  }

  input.value = ""
  loadFeed()
}