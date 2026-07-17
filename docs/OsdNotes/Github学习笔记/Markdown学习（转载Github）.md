# Markdown学习（转载Github）

## Step 1: Add headings

**What is _Markdown_?** Markdown is a [lightweight syntax](https://docs.github.com/github/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) for communicating on GitHub. You can format text to add a heading, lists, **bold**, _italics_, tables, and many other stylings. You can use Markdown in most places around GitHub such as:

- Comments on [issues](https://docs.github.com/issues/tracking-your-work-with-issues/about-issues), [pull requests](https://docs.github.com/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests), and [discussions](https://docs.github.com/discussions/collaborating-with-your-community-using-discussions/about-discussions)
- Files with the `.md` or `.markdown` extension
- Snippets of text in [Gists](https://docs.github.com/github/writing-on-github/editing-and-sharing-content-with-gists/creating-gists)

**What is a _heading_?** A heading is a larger bit of text at the beginning of a section. There are six sizes.

### Example

```md
# This is an `<h1>` heading, which is the largest

## This is an `<h2>` heading

###### This is an `<h6>`heading, which is the smallest
```

### ⌨️ Activity: Create a markdown file

1. Open a new browser tab, and work on the steps in your second tab while you read the instructions in this tab.
    
2. In the top navigation, 按住Ctrl，点击 the **Code** tab.
    
3. Create a new branch with the following name:
	```md
    start-blog
    ```
    
4. Above the files list, click the **Add file** button and select **Create new file**.
    
5. Use the following file name.
    
    ```md
    day-1.md
    ```
    
6. In the editor, on the first line use a level one heading to give the page a title.
    
    ```md
    # Daily Learning
    ```
    
7. Add a couple level 2 headings for the names of each of the blog posts.
    
    ```md
    ## Morning Planning
    
    ## Review
    ```
    
8. Above the editor, click the **Preview** toggle to view the rendered version.
    
9. In the top right, click the **Commit changes** button and commit directly to the `start-blog` branch.

## Step 2: Make a list

Markdown supports 3 types of common lists. They include:

- [Unordered](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#lists) - Bulleted list
- [Ordered](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#lists) - Number list
- [Task](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#task-lists) - Checkbox list

### Unordered list

An unordered list is simple to show. Each item is placed on its own line using a `-`, `*`, or `+` character.

```md
- Item 1
- Item 2
- Item 3
```

- Item 1
- Item 2
- Item 3

### Ordered List

A list is changed to ordered by using any number instead of the list character. Notice how markdown automatically handles the counting. Nice!

```md
1. Step 1
2. Step 2
3. Step 3
```

1. Step 1
2. Step 2
3. Step 3

### Task List

A task list is extends the unordered list to use check boxes.  
Add empty brackets `[ ]` for incomplete tasks and filled brackets `[x]` for complete tasks. Note: The empty required space for empty brackets.

```md
- [x] This task is complete
- [ ] This task is not complete
```

- [x] This task is complete
- [ ] This task is not complete
    

>TIP        Issues and pull requests can use task syntax for [conveying progress](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-tasklists).

### ⌨️ Activity: Add ideas and goals to our morning plan

1. On the `start-blog` branch, open the `day-1.md` file for editing.
    
2. Add the following task list below **morning planning** level two heading to track goals you want to achieve.
    
    ```md
    - [ ] Check out the [github blog](https://github.blog/) for topic ideas.
    - [ ] Learn about [GitHub Pages](https://skills.github.com/#first-day-on-github).
    - [ ] Convert my first blog post into an actual webpage.
    ```
    
3. Use the **Preview** tab to check your Markdown formatting.
    
4. In the top right, click the **Commit changes** button and commit directly to the `start-blog` branch.

## Step 3: Add a code sample

Let's learn about [code blocks](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#quoting-code) and [syntax highlighting](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks) based on the language.

> TIP     Many programming languages are supported. Try testing out some other file extension types!

### Example: Terminal Command

```md
```bash
git clone https://github.com/skills/communicate-using-markdown
```
```

```shell
git clone https://github.com/skills/communicate-using-markdown
```

### Example: Javascript Code

```js
var myVar = "Hello, world!";

var myVar = "Hello, world!";
```

### Activity: Adding a code example

1. On the `start-blog` branch, open the `day-1.md` file for editing.
    
2. Below **Review** level two heading add the following entry recording an awesome code snippet you just learned from the GitHub Blog.
    ```md
    Convert an image or video from dark mode to light mode using [ffmpeg](https://www.ffmpeg.org)
    
    ```bash
    ffmpeg -i input.mp4 -vf "negate,hue=h=180,eq=contrast=1.2:saturation=1.1" output.mp4
    ```
    
3. Use the **Preview** tab to check your Markdown formatting.
    
4. In the top right, click the **Commit changes** button and commit directly to the `start-blog` branch.

# Step 4: Add an image

Let's learn how to include [images in markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#images), using relative urls, absolute urls, sizing, and basic positioning.

## Regular Markdown

Images can be displayed by providing a relative URL to a file in the repository or an absolute URL (to anywhere on the internet).

The descriptive text in the square brackets is displayed if the image is unable to load, and it is also read aloud for people using screen readers.

Note: Markdown syntax doesn't provide an option to change the image size.

## Example

Relative URL to an image in the repository:

```md
![Mona the Octocat](myrepo/original.png)

```

Absolute URL to an image on the internet:

```md
![Mona the Octocat](https://octodex.github.com/images/original.png)
```

## Simple HTML

You will often find the need to reduce the size of an image or simply place it next to some text. Regular HTML syntax provides some additional flexibility.

- The `alt` field specifies the alternative text.
- The `src` field specifies the source URL of the image.
- A `width` and/or `height` field can be used to specify the size in pixels.
- The `align` field allows setting a position (`left`, `right`)

```md
<img alt="Mona the Octocat" src="https://octodex.github.com/images/original.png"
width="200" align="right">
```

## ⌨️ Activity: Add some decoration

Our blog post is quite simple right now. Let's add some decoration.

1. On the `start-blog` branch, open the `day-1.md` file for editing.
    
2. Insert an image below the **Morning Planning** level 1 heading.
    
    ```md
    ![Cloudy morning](https://octodex.github.com/images/cloud.jpg)
    ```
    
3. Use the **Preview** tab to check your Markdown formatting.
    
    - Notice the image is too large for our purpose.
4. Replace the simple markdown version with an HTML version that includes size and position info. Much better!
    ```md
    <img alt="Cloudy morning" src="https://octodex.github.com/images/cloud.jpg" width="100" align="right">
    ```
    
5. In the top right, click the **Commit changes** button and commit directly to the `start-blog` branch.
